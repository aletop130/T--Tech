# Implementazione Chat con Function Calling

Questo documento spiega come implementare una chat con function calling integrata con Cesium per il controllo della mappa 3D.

## Architettura Generale

```
Frontend (AgentChat)
    ↓ SSE Stream
Backend (/chat/stream)
    ↓ Tool Calls
AI Service (Regolo.ai)
    ↓ Actions
Cesium Controller
    ↓ Render
Mappa 3D
```

## Flusso Completo

### 1. Utente Invia Messaggio

**Frontend** - `AgentChat.tsx`
```typescript
const userMessage = { role: 'user', content: "Mostrami la ISS" };
const sceneState = cesiumController.getSceneState();

sseClient.streamChat([userMessage], sceneState);
```

### 2. Backend Riceve e Processa

**API Endpoint** - `ai.py`
```python
@router.post("/chat/stream")
async def stream_chat(request: Request, ...):
    body = await request.json()
    messages = body.get("messages", [])
    scene_state = body.get("sceneState", {})
    
    async for data in service.stream_chat_with_functions(
        messages, scene_state, tenant_id
    ):
        yield data
```

### 3. AI Service con Function Calling

**AIService** - `ai.py`
```python
async def stream_chat_with_functions(self, messages, scene_state, tenant_id):
    # 1. Prepara il contesto con i dati dei satelliti
    satellites = await self._get_satellites_context(tenant_id)
    system_content = f"""
    {self.SYSTEM_PROMPT}
    
    Available satellites:
    {json.dumps(satellites)}
    """
    
    full_messages = [
        {"role": "system", "content": system_content}
    ] + messages
    
    # 2. Prima chiamata con tools (NON streaming)
    response = await self.client.chat.completions.create(
        model=settings.REGOLO_MODEL,
        messages=full_messages,
        tools=CESIUM_FUNCTION_DEFINITIONS,  # ← Definizioni dei tool
    )
    
    # 3. Gestisci tool calls se presenti
    if response_message.tool_calls:
        for tool_call in response_message.tool_calls:
            action = self._create_cesium_action(
                tool_call.function.name,
                json.loads(tool_call.function.arguments)
            )
            # Emetti azione immediatamente
            yield f"data: {{'type': 'action', 'action_type': action.type, 'payload': action.payload}}\n\n"
        
        # Aggiungi risultati tool ai messaggi
        full_messages.append({...})  # tool call
        full_messages.append({...})  # tool result
        
        # 4. Seconda chiamata streaming per risposta testuale
        final_response = await self.client.chat.completions.create(
            messages=full_messages,
            stream=True,  # ← Ora streaming
        )
        
        async for chunk in final_response:
            yield f"data: {{'type': 'content', 'chunk': chunk.text}}\n\n"
    
    yield "data: [DONE]\n\n"
```

### 4. Frontend Riceve Eventi SSE

**SSE Client** - `sse-client.ts`
```typescript
private handleEvent(event: Record<string, unknown>): void {
  switch (event.type) {
    case 'content':
      // Aggiorna UI con testo
      this.config.onMessageChunk?.(event.chunk, false);
      break;
      
    case 'action':
      // Esegui azione su Cesium
      this.config.onAction?.({
        type: event.action_type,
        payload: event.payload
      });
      break;
  }
}
```

### 5. Esecuzione Azione Cesium

**AgentChat** - `AgentChat.tsx`
```typescript
onAction: (action) => {
  const cesiumAction: CesiumAction = {
    type: action.type as CesiumAction['type'],
    payload: action.payload,
  };
  // Esegui immediatamente
  cesiumController.dispatch(cesiumAction);
  
  // Salva nel messaggio per visualizzazione
  setMessages((msgs) =>
    msgs.map((msg) =>
      msg.id === assistantMessageId
        ? { ...msg, actions: [...(msg.actions || []), cesiumAction] }
        : msg
    )
  );
}
```

**Cesium Controller** - `controller.ts`
```typescript
dispatch(action: CesiumAction): void {
  const handler = this.actionHandlers.get(action.type);
  if (handler) {
    handler(action.payload);
  }
}

private handleFlyTo(payload: Record<string, unknown>): void {
  const entityId = payload.entityId as string;
  const entity = this.viewer.entities.getById(entityId);
  
  if (entity) {
    this.viewer.flyTo(entity, {
      duration: payload.duration || 2.0,
    });
  }
}
```

## Definizione dei Tools

### Backend - `schemas/cesium.py`

```python
CESIUM_FUNCTION_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "cesium_fly_to",
            "description": "Fly camera to entity or coordinates",
            "parameters": {
                "type": "object",
                "properties": {
                    "entityId": {
                        "type": "string",
                        "description": "Entity ID to fly to"
                    },
                    "longitude": {"type": "number"},
                    "latitude": {"type": "number"},
                    "altitude": {"type": "number"},
                    "duration": {"type": "number", "default": 2.0}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "cesium_fly_to_country",
            "description": "Fly to a country",
            "parameters": {
                "type": "object",
                "properties": {
                    "country": {
                        "type": "string",
                        "enum": ["Italy", "Nigeria", "USA", ...]
                    }
                },
                "required": ["country"]
            }
        }
    }
]
```

### Frontend - `controller.ts`

```typescript
// Registra handler
private registerDefaultHandlers(): void {
  this.registerHandler('cesium.flyTo', this.handleFlyTo.bind(this));
  this.registerHandler('cesium.flyToCountry', this.handleFlyToCountry.bind(this));
}

// Implementa handler
private handleFlyToCountry(payload: Record<string, unknown>): void {
  const country = payload.country as string;
  const coords = this.countryCoordinates[country];
  
  this.viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      coords.lon, coords.lat, 5000000
    ),
    orientation: {
      heading: 0,
      pitch: -90,  // Top-down
      roll: 0
    }
  });
}
```

## Aggiungere un Nuovo Tool

### 1. Definisci in `schemas/cesium.py`

```python
{
    "type": "function",
    "function": {
        "name": "cesium_set_time",
        "description": "Set simulation time",
        "parameters": {
            "type": "object",
            "properties": {
                "time": {
                    "type": "string",
                    "description": "ISO 8601 timestamp"
                },
                "multiplier": {
                    "type": "number",
                    "description": "Time speed (1.0 = real-time)"
                }
            },
            "required": ["time"]
        }
    }
}
```

### 2. Aggiorna Action Type

**Backend** - `schemas/cesium.py`
```python
class CesiumAction(BaseModel):
    type: Literal[
        'cesium.setClock',
        'cesium.flyTo',
        'cesium.setTime',  # ← Nuovo
    ]
```

**Frontend** - `controller.ts`
```typescript
export interface CesiumAction {
  type: 'cesium.setClock' | 'cesium.setTime';  // ← Nuovo
}
```

### 3. Aggiungi Mapping nel Backend

**`ai.py`**
```python
def _create_cesium_action(self, function_name, arguments):
    action_map = {
        "cesium_set_time": ("cesium.setTime", {
            "time": arguments.get("time"),
            "multiplier": arguments.get("multiplier"),
        }),
        # ... altri
    }
```

### 4. Aggiungi Handler nel Frontend

**`controller.ts`**
```typescript
private registerDefaultHandlers(): void {
  this.registerHandler('cesium.setTime', this.handleSetTime.bind(this));
}

private handleSetTime(payload: Record<string, unknown>): void {
  if (!this.viewer) return;
  
  const time = payload.time as string;
  const multiplier = (payload.multiplier as number) || 1.0;
  
  this.viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date(time));
  this.viewer.clock.multiplier = multiplier;
}
```

## Contesto Dati

### Satelliti nel Database

Il backend ottiene automaticamente i satelliti dal database:

```python
async def _get_satellites_context(self, tenant_id: str) -> list[dict]:
    sats, _ = await self.ontology.list_satellites(tenant_id=tenant_id)
    
    return [
        {
            "id": sat.id,
            "entityId": f"satellite-{sat.id}",  # Cesium format
            "name": sat.name,
            "norad_id": sat.norad_id,
            "is_active": sat.is_active,
        }
        for sat in sats
    ]
```

### Scene State

Il frontend invia lo stato attuale della scena:

```typescript
const sceneState = cesiumController.getSceneState();
// {
//   camera: { longitude, latitude, altitude, heading, pitch, roll },
//   clock: { currentTime, multiplier },
//   entities: { satellites: 10, groundStations: 5 }
// }
```

## Best Practices

### 1. Emetti Azioni Prima della Risposta Testuale

```python
# Prima emetti l'azione (utente vede subito l'effetto)
yield f"data: {{'type': 'action', ...}}\n\n"

# Poi la risposta testuale
yield f"data: {{'type': 'content', 'chunk': 'Sto mostrando...'}}\n\n"
```

### 2. Gestisci Errori Gracefully

```typescript
onError: (error: string) => {
  console.error('SSE Error:', error);
  setMessages((msgs) =>
    msgs.map((msg) =>
      msg.id === assistantMessageId
        ? { ...msg, content: `Errore: ${error}`, isStreaming: false }
        : msg
    )
  );
}
```

### 3. Mantieni Stato Messaggi

Ogni messaggio dell'assistente traccia:
- `content`: Testo della risposta
- `actions`: Array di azioni Cesium eseguite
- `toolCalls`: Tool calls effettuate
- `isStreaming`: Stato dello streaming

### 4. Non Inventare Dati

```python
# Se non ci sono satelliti, dillo chiaramente
if not satellites:
    return []  # Modello dirà "Non ho dati disponibili"

# Mai generare mock data
```

## Test

### Verifica Function Calling

```typescript
// Test 1: Zoom su entità
await sseClient.streamChat(
  [{ role: 'user', content: 'Show me ISS' }],
  sceneState
);
// Expected: evento 'action' con type='cesium.flyTo'

// Test 2: Risposta senza azioni
await sseClient.streamChat(
  [{ role: 'user', content: 'Hello' }],
  sceneState
);
// Expected: solo eventi 'content', nessun 'action'

// Test 3: Paese
await sseClient.streamChat(
  [{ role: 'user', content: 'Fly to Italy' }],
  sceneState
);
// Expected: evento 'action' con type='cesium.flyToCountry'
```

## Troubleshooting

| Problema | Causa | Soluzione |
|----------|-------|-----------|
| Nessuna azione eseguita | Modello non ha chiamato tool | Verifica tools in system prompt |
| Azione non eseguita | Handler non registrato | Aggiungi in `registerDefaultHandlers` |
| Doppia azione | yield prima e dopo | Emetti solo nel loop tool_calls |
| Latenza alta | Streaming non usato | Usa streaming per seconda chiamata |
| Errore JSON | Payload malformato | Verifica serializzazione in `_create_cesium_action` |

## Riferimenti

- **Backend**: `backend/app/services/ai.py`, `backend/app/schemas/cesium.py`
- **Frontend**: `frontend/src/components/Chat/AgentChat.tsx`, `frontend/src/lib/cesium/controller.ts`
- **API**: `backend/app/api/v1/ai.py`
- **SSE**: `frontend/src/lib/sse-client.ts`
