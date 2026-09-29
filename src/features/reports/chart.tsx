'use client';
import {BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer} from 'recharts';
import type {Report} from './contracts';
export default function DailyChart({rows}:{rows:Report['rows']}){
 return <div aria-hidden="true" style={{height:240,minWidth:0}}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows.map(r=>({date:r.date,purchases:r.purchases}))}><XAxis dataKey="date" tickFormatter={v=>String(v).slice(5)}/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="purchases" fill="#166534" name="Recorded purchases" isAnimationActive={false}/></BarChart></ResponsiveContainer></div>;
}
