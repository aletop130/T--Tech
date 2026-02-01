import { create } from 'zustand';

interface AppState {
  sidebarCollapsed: boolean;
  currentTenant: string;
  selectedObjectId: string | null;
  selectedObjectType: string | null;
  
  toggleSidebar: () => void;
  setTenant: (tenant: string) => void;
  selectObject: (type: string, id: string) => void;
  clearSelection: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: false,
  currentTenant: 'default',
  selectedObjectId: null,
  selectedObjectType: null,
  
  toggleSidebar: () => set((state) => ({ 
    sidebarCollapsed: !state.sidebarCollapsed 
  })),
  
  setTenant: (tenant) => set({ currentTenant: tenant }),
  
  selectObject: (type, id) => set({ 
    selectedObjectType: type, 
    selectedObjectId: id 
  }),
  
  clearSelection: () => set({ 
    selectedObjectType: null, 
    selectedObjectId: null 
  }),
}));

