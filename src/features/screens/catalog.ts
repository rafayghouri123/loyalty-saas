import { publicCustomerScreens } from './public-customer';
import { staffOwnerScreens } from './staff-owner';
import { operationScreens } from './operations';
export const screens = [...publicCustomerScreens, ...staffOwnerScreens, ...operationScreens];
export const screenById = (id: string) => screens.find(screen => screen.id === id);
