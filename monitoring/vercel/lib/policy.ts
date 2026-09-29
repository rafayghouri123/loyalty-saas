export const MONITOR_HOOK='loyalty-monitor-singleton-v1';
export type MonitorState={previous:string[]|null;lastSent:number};
export type CheckResult={state:MonitorState;stopped:boolean;observedAt?:string;alerts?:string[];receipt?:{provider:string;messageId?:string}};
