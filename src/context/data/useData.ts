import { useContext } from 'react';
import { DataContext } from './DataContext';

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData doit être utilisé au sein d’un DataProvider');
  }
  return context;
}
