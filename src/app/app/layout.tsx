import { verifiedUser } from '@/lib/db/server';
import { DeviceSessionGuard, SignOutButton } from '@/components/device-session';

export default async function CustomerLayout({children}:{children:React.ReactNode}) {
  const {user}=await verifiedUser();
  return <><DeviceSessionGuard userId={user?.id??null}/>{user&&<div className="container" style={{paddingTop:24,display:'flex',justifyContent:'flex-end'}}><SignOutButton/></div>}{children}</>;
}
