
"use client";

import { useState, useEffect, useMemo } from 'react';
import { FirestoreService } from '@/services/firestoreService';
import { DateRange } from 'react-day-picker';

const defaultDateRange = (): DateRange => {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), 1);
  return { from, to };
};

const defaultData = {
  categorias: [],
  subcategorias: [],
  entries: [],
};

const defaultConfig = {
  dateRange: defaultDateRange(),
  dark: false,
  privacy: false,
  name: ""
};

export function useFirestore(userId: string | undefined) {
  const [data, setData] = useState(defaultData);
  const [config, setConfigState] = useState(defaultConfig);
  const [loading, setLoading] = useState(true);

  const service = useMemo(() => {
    if (!userId) return null;
    return new FirestoreService(userId);
  }, [userId]);

  useEffect(() => {
    if (!service) {
      // If there's no user, we might be in a logged-out state.
      // Reset to default and stop loading.
      setData(defaultData);
      setConfigState(defaultConfig);
      if (userId === null) { // Explicitly logged out
         setLoading(false);
      }
      return;
    }

    setLoading(true);
    let isMounted = true;

    const initialState = {
      categorias: [],
      subcategorias: [],
      entries: [],
    };

    const loadInitialData = async () => {
      await service.initializeDefaultData();
      
      const [categorias, subcategorias, entries, loadedConfig] = await Promise.all([
        service.getCategorias(),
        service.getSubcategorias(),
        service.getEntries(),
        service.getConfig(),
      ]);

      if (!isMounted) return;

      initialState.categorias = categorias;
      initialState.subcategorias = subcategorias;
      initialState.entries = entries;
      
      setData(initialState);
      if (loadedConfig) {
        // Ensure date objects are correctly hydrated from Firestore Timestamps
        const hydratedConfig = { ...loadedConfig };
        if (hydratedConfig.dateRange?.from && typeof hydratedConfig.dateRange.from.toDate === 'function') {
          hydratedConfig.dateRange.from = hydratedConfig.dateRange.from.toDate();
        }
        if (hydratedConfig.dateRange?.to && typeof hydratedConfig.dateRange.to.toDate === 'function') {
          hydratedConfig.dateRange.to = hydratedConfig.dateRange.to.toDate();
        }
        setConfigState(prev => ({ ...prev, ...hydratedConfig }));
      }
      setLoading(false);
    };

    loadInitialData();

    const unsubscribe = service.subscribeToData((update) => {
        if(!isMounted) return;
        setData(prevData => ({
            ...prevData,
            [update.type]: update.data,
        }));
    });
    
    return () => {
      isMounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [service, userId]);

  const setConfig = (newConfig) => {
    const updatedConfig = typeof newConfig === 'function' ? newConfig(config) : newConfig;
    setConfigState(updatedConfig);
    service?.saveConfig(updatedConfig);
  };

  return { data, config, setConfig, service, loading };
}
