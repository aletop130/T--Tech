Implementa il sistema Detour DESCRITTO in:
docs/DETOUR_IMPLEMENTATION_PLAN.txt

Regole dure:
- Per le dipendenze usa sempre questo ambiente virtuale : /root/T--Tech/backend/.venv , command : source ~/T--Tech/backend/.venv/bin/activate
- Quel documento è la SPEC: struttura directory, task 2.x, test 3.x, regole finali “NOTE FINALI PER RALPH CODING AGENT”.
- Non inventare architetture alternative. Se manca qualcosa nel repo, aggiungila come da spec.
- Lavora a task atomici: completa UN task per iterazione, poi aggiorna .ralph/ralph-tasks.md marcando [x].
- Mantieni type hints, error handling, logging, RBAC, test come richiesto dalla spec.
- Alla fine di ogni iterazione:
  1) esegui i check/test pertinenti
  2) se il task è finito stampa ESATTAMENTE: READY_FOR_NEXT_TASK
  3) se tutti i task sono finiti stampa: COMPLETE