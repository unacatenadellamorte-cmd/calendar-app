import { createContext, type ReactNode } from 'react';

export const ProfileHeaderContext = createContext<ReactNode>(null);
export const ProfileHeaderProvider = ProfileHeaderContext.Provider;
