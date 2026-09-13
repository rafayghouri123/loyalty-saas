// Generated from the migrated PostgreSQL catalog. Do not hand-edit.
// Bigint table reads require decimal-string RPC projections for product money/units.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type Database = { public: { Tables: {
"audit_events": {
Row: {
"id": string;
"business_id": string | null;
"actor_user_id": string | null;
"action": string;
"target_type": string;
"target_id": string | null;
"reason": string | null;
"safe_changes": Json;
"correlation_id": string;
"support_access_grant_id": string | null;
"occurred_at": string;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id"?: string | null;
"actor_user_id"?: string | null;
"action": string;
"target_type": string;
"target_id"?: string | null;
"reason"?: string | null;
"safe_changes": Json;
"correlation_id": string;
"support_access_grant_id"?: string | null;
"occurred_at": string;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string | null;
"actor_user_id"?: string | null;
"action"?: string;
"target_type"?: string;
"target_id"?: string | null;
"reason"?: string | null;
"safe_changes"?: Json;
"correlation_id"?: string;
"support_access_grant_id"?: string | null;
"occurred_at"?: string;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "audit_events_actor_user_id_fkey"; columns: ["actor_user_id"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false },
{ foreignKeyName: "audit_events_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false }
];
};
"branch_assignments": {
Row: {
"business_id": string;
"business_user_id": string;
"branch_id": string;
"created_at": string;
};
Insert: {
"business_id": string;
"business_user_id": string;
"branch_id": string;
"created_at"?: string;
};
Update: {
"business_id"?: string;
"business_user_id"?: string;
"branch_id"?: string;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "branch_assignments_business_id_branch_id_fkey"; columns: ["business_id","branch_id"]; referencedRelation: "branches"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "branch_assignments_business_id_business_user_id_fkey"; columns: ["business_id","business_user_id"]; referencedRelation: "business_users"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "branch_assignments_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false }
];
};
"branches": {
Row: {
"id": string;
"business_id": string;
"name": string;
"address": string;
"city": string;
"area": string | null;
"maps_url": string | null;
"phone": string | null;
"status": string;
"created_at": string;
"updated_at": string;
"row_version": number;
};
Insert: {
"id"?: string;
"business_id": string;
"name": string;
"address": string;
"city": string;
"area"?: string | null;
"maps_url"?: string | null;
"phone"?: string | null;
"status"?: string;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Update: {
"id"?: string;
"business_id"?: string;
"name"?: string;
"address"?: string;
"city"?: string;
"area"?: string | null;
"maps_url"?: string | null;
"phone"?: string | null;
"status"?: string;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Relationships: [
{ foreignKeyName: "branches_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false }
];
};
"business_users": {
Row: {
"id": string;
"business_id": string;
"user_id": string;
"staff_display_name": string;
"staff_email": string;
"role": string;
"status": string;
"can_manage_campaigns": boolean;
"can_contact_customers": boolean;
"can_reverse_transactions": boolean;
"can_export_reports": boolean;
"created_at": string;
"updated_at": string;
"row_version": number;
};
Insert: {
"id"?: string;
"business_id": string;
"user_id": string;
"staff_display_name": string;
"staff_email": string;
"role": string;
"status"?: string;
"can_manage_campaigns"?: boolean;
"can_contact_customers"?: boolean;
"can_reverse_transactions"?: boolean;
"can_export_reports"?: boolean;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Update: {
"id"?: string;
"business_id"?: string;
"user_id"?: string;
"staff_display_name"?: string;
"staff_email"?: string;
"role"?: string;
"status"?: string;
"can_manage_campaigns"?: boolean;
"can_contact_customers"?: boolean;
"can_reverse_transactions"?: boolean;
"can_export_reports"?: boolean;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Relationships: [
{ foreignKeyName: "business_users_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "business_users_user_id_fkey"; columns: ["user_id"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"businesses": {
Row: {
"id": string;
"slug": string;
"display_name": string;
"description": string | null;
"status": string;
"timezone": string;
"currency": string;
"logo_asset_id": string | null;
"cover_asset_id": string | null;
"accent_hex": string;
"public_contact_phone": string | null;
"support_email": string | null;
"menu_url": string | null;
"review_url": string | null;
"published_at": string | null;
"created_by": string;
"created_at": string;
"updated_at": string;
"row_version": number;
};
Insert: {
"id"?: string;
"slug": string;
"display_name": string;
"description"?: string | null;
"status"?: string;
"timezone"?: string;
"currency"?: string;
"logo_asset_id"?: string | null;
"cover_asset_id"?: string | null;
"accent_hex"?: string;
"public_contact_phone"?: string | null;
"support_email"?: string | null;
"menu_url"?: string | null;
"review_url"?: string | null;
"published_at"?: string | null;
"created_by": string;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Update: {
"id"?: string;
"slug"?: string;
"display_name"?: string;
"description"?: string | null;
"status"?: string;
"timezone"?: string;
"currency"?: string;
"logo_asset_id"?: string | null;
"cover_asset_id"?: string | null;
"accent_hex"?: string;
"public_contact_phone"?: string | null;
"support_email"?: string | null;
"menu_url"?: string | null;
"review_url"?: string | null;
"published_at"?: string | null;
"created_by"?: string;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Relationships: [
{ foreignKeyName: "businesses_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"job_effect_receipts": {
Row: {
"id": string;
"business_id": string | null;
"handler_name": string;
"event_key": string;
"completed_at": string;
"result_reference": string | null;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id"?: string | null;
"handler_name": string;
"event_key": string;
"completed_at": string;
"result_reference"?: string | null;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string | null;
"handler_name"?: string;
"event_key"?: string;
"completed_at"?: string;
"result_reference"?: string | null;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "job_effect_receipts_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false }
];
};
"operational_checks": {
Row: {
"name": string;
"checked_at": string;
"status": string;
"safe_details": Json;
};
Insert: {
"name": string;
"checked_at": string;
"status": string;
"safe_details": Json;
};
Update: {
"name"?: string;
"checked_at"?: string;
"status"?: string;
"safe_details"?: Json;
};
Relationships: [

];
};
"outbox_events": {
Row: {
"id": string;
"business_id": string | null;
"event_type": string;
"event_key": string;
"schema_version": number;
"payload": Json;
"state": string;
"dispatched_at": string | null;
"created_at": string;
"updated_at": string;
"row_version": number;
};
Insert: {
"id"?: string;
"business_id"?: string | null;
"event_type": string;
"event_key": string;
"schema_version": number;
"payload": Json;
"state"?: string;
"dispatched_at"?: string | null;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Update: {
"id"?: string;
"business_id"?: string | null;
"event_type"?: string;
"event_key"?: string;
"schema_version"?: number;
"payload"?: Json;
"state"?: string;
"dispatched_at"?: string | null;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Relationships: [
{ foreignKeyName: "outbox_events_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false }
];
};
"profiles": {
Row: {
"user_id": string;
"auth_user_id": string | null;
"display_name": string;
"preferred_timezone": string;
"birthday_month": number | null;
"birthday_day": number | null;
"birthday_changed_at": string | null;
"deletion_requested_at": string | null;
"anonymized_at": string | null;
"created_at": string;
"updated_at": string;
"row_version": number;
};
Insert: {
"user_id": string;
"auth_user_id"?: string | null;
"display_name": string;
"preferred_timezone"?: string;
"birthday_month"?: number | null;
"birthday_day"?: number | null;
"birthday_changed_at"?: string | null;
"deletion_requested_at"?: string | null;
"anonymized_at"?: string | null;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Update: {
"user_id"?: string;
"auth_user_id"?: string | null;
"display_name"?: string;
"preferred_timezone"?: string;
"birthday_month"?: number | null;
"birthday_day"?: number | null;
"birthday_changed_at"?: string | null;
"deletion_requested_at"?: string | null;
"anonymized_at"?: string | null;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Relationships: [
{ foreignKeyName: "profiles_auth_user_id_fkey"; columns: ["auth_user_id"]; referencedRelation: "users"; referencedColumns: ["id"]; isOneToOne: false }
];
};
"push_devices": {
Row: {
"id": string;
"customer_user_id": string;
"installation_id": string;
"binding_generation": string;
"token_ciphertext": string;
"encryption_key_id": string;
"token_hash": string;
"status": string;
"last_seen_at": string;
"revoked_at": string | null;
"browser_label": string | null;
"created_at": string;
"updated_at": string;
"row_version": number;
};
Insert: {
"id"?: string;
"customer_user_id": string;
"installation_id": string;
"binding_generation"?: string;
"token_ciphertext": string;
"encryption_key_id": string;
"token_hash": string;
"status"?: string;
"last_seen_at"?: string;
"revoked_at"?: string | null;
"browser_label"?: string | null;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Update: {
"id"?: string;
"customer_user_id"?: string;
"installation_id"?: string;
"binding_generation"?: string;
"token_ciphertext"?: string;
"encryption_key_id"?: string;
"token_hash"?: string;
"status"?: string;
"last_seen_at"?: string;
"revoked_at"?: string | null;
"browser_label"?: string | null;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Relationships: [
{ foreignKeyName: "push_devices_customer_user_id_fkey"; columns: ["customer_user_id"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false },
{ foreignKeyName: "push_devices_installation_id_fkey"; columns: ["installation_id"]; referencedRelation: "push_installations"; referencedColumns: ["id"]; isOneToOne: false }
];
};
"push_registration_challenges": {
Row: {
"id": string;
"customer_user_id": string;
"auth_session_id": string;
"installation_id": string;
"push_device_id": string;
"nonce_hash": string;
"nonce_ciphertext": string;
"encryption_key_id": string;
"binding_generation": string;
"expires_at": string;
"consumed_at": string | null;
"canceled_at": string | null;
"dispatch_state": string;
"created_at": string;
};
Insert: {
"id"?: string;
"customer_user_id": string;
"auth_session_id": string;
"installation_id": string;
"push_device_id": string;
"nonce_hash": string;
"nonce_ciphertext": string;
"encryption_key_id": string;
"binding_generation"?: string;
"expires_at"?: string;
"consumed_at"?: string | null;
"canceled_at"?: string | null;
"dispatch_state"?: string;
"created_at"?: string;
};
Update: {
"id"?: string;
"customer_user_id"?: string;
"auth_session_id"?: string;
"installation_id"?: string;
"push_device_id"?: string;
"nonce_hash"?: string;
"nonce_ciphertext"?: string;
"encryption_key_id"?: string;
"binding_generation"?: string;
"expires_at"?: string;
"consumed_at"?: string | null;
"canceled_at"?: string | null;
"dispatch_state"?: string;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "push_registration_challenges_customer_user_id_fkey"; columns: ["customer_user_id"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false },
{ foreignKeyName: "push_registration_challenges_installation_id_fkey"; columns: ["installation_id"]; referencedRelation: "push_installations"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "push_registration_challenges_push_device_id_fkey"; columns: ["push_device_id"]; referencedRelation: "push_devices"; referencedColumns: ["id"]; isOneToOne: false }
];
};
"rate_limit_buckets": {
Row: {
"subject_hash": string;
"operation": string;
"window_start": string;
"window_seconds": number;
"count": number;
"expires_at": string;
};
Insert: {
"subject_hash": string;
"operation": string;
"window_start": string;
"window_seconds": number;
"count": number;
"expires_at": string;
};
Update: {
"subject_hash"?: string;
"operation"?: string;
"window_start"?: string;
"window_seconds"?: number;
"count"?: number;
"expires_at"?: string;
};
Relationships: [

];
};
}; Views: { [_ in never]: never }; Functions: {
"acknowledge_push_challenge": { Args: {"p_challenge_id": string;"p_installation_id": string;"p_nonce": string}; Returns: Json };
"complete_profile": { Args: {"p_display_name": string;"p_correlation_id": string}; Returns: Json };
"database_readiness": { Args: Record<string, never>; Returns: boolean };
"gateway_limit_magic_link": { Args: {"p_email_subject": string;"p_ip_subject": string}; Returns: Json };
"gateway_request_push_challenge": { Args: {"p_user": string;"p_session": string;"p_installation": string;"p_installation_secret_hash": string;"p_token_hash": string;"p_token_ciphertext": string;"p_key_id": string;"p_nonce_hash": string;"p_nonce_ciphertext": string}; Returns: Json };
"revoke_push_installation": { Args: {"p_installation_id": string}; Returns: Json };
"worker_claim_push_challenge": { Args: {"p_outbox_id": string}; Returns: Json };
"worker_expire_push_challenges": { Args: Record<string, never>; Returns: number };
"worker_finish_push_challenge": { Args: {"p_challenge_id": string;"p_state": string}; Returns: undefined };
"worker_heartbeat": { Args: Record<string, never>; Returns: undefined };
"worker_mark_dispatched": { Args: {"p_id": string}; Returns: undefined };
"worker_observe_profile": { Args: {"p_outbox_id": string}; Returns: boolean };
"worker_pending_outbox": { Args: Record<string, never>; Returns: Json[] };
"worker_purge_rate_limits": { Args: Record<string, never>; Returns: number };
}; Enums: { [_ in never]: never }; CompositeTypes: { [_ in never]: never }; } };
