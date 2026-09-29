// Generated from the migrated PostgreSQL catalog. Do not hand-edit.
// Bigint table reads require decimal-string RPC projections for product money/units.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type Database = { public: { Tables: {
"adjustments": {
Row: {
"id": string;
"business_id": string;
"membership_id": string;
"units": number;
"reason": string;
"actor_user_id": string;
"idempotency_key": string;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"membership_id": string;
"units": number;
"reason": string;
"actor_user_id": string;
"idempotency_key": string;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"membership_id"?: string;
"units"?: number;
"reason"?: string;
"actor_user_id"?: string;
"idempotency_key"?: string;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "adjustments_actor_user_id_fkey"; columns: ["actor_user_id"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false },
{ foreignKeyName: "adjustments_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "adjustments_business_id_membership_id_fkey"; columns: ["business_id","membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: false }
];
};
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
{ foreignKeyName: "audit_events_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "audit_events_support_access_grant_id_fkey"; columns: ["support_access_grant_id"]; referencedRelation: "support_access_grants"; referencedColumns: ["id"]; isOneToOne: false }
];
};
"automation_rules": {
Row: {
"id": string;
"business_id": string;
"kind": "reward_available" | "inactivity" | "birthday";
"enabled": boolean;
"title_template": string;
"body_template": string;
"inactive_days": number | null;
"reward_version_id": string | null;
"offer_id": string | null;
"birthday_validity_days": number | null;
"version": number;
"updated_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"kind": "reward_available" | "inactivity" | "birthday";
"enabled"?: boolean;
"title_template": string;
"body_template": string;
"inactive_days"?: number | null;
"reward_version_id"?: string | null;
"offer_id"?: string | null;
"birthday_validity_days"?: number | null;
"version"?: number;
"updated_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"kind"?: "reward_available" | "inactivity" | "birthday";
"enabled"?: boolean;
"title_template"?: string;
"body_template"?: string;
"inactive_days"?: number | null;
"reward_version_id"?: string | null;
"offer_id"?: string | null;
"birthday_validity_days"?: number | null;
"version"?: number;
"updated_at"?: string;
};
Relationships: [
{ foreignKeyName: "automation_rules_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "automation_rules_business_id_offer_id_fkey"; columns: ["business_id","offer_id"]; referencedRelation: "offers"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "automation_rules_business_id_reward_version_id_fkey"; columns: ["business_id","reward_version_id"]; referencedRelation: "reward_versions"; referencedColumns: ["business_id","id"]; isOneToOne: false }
];
};
"automation_runs": {
Row: {
"id": string;
"business_id": string;
"rule_id": string;
"rule_version": number;
"membership_id": string;
"event_key": string;
"state": "pending" | "suppressed" | "processing" | "completed" | "failed";
"scheduled_at": string;
"expires_at": string;
"suppression_reason": string | null;
"rendered_title": string;
"rendered_body": string;
"rule_snapshot": Json;
"source_purchase_id": string | null;
"source_ledger_entry_id": string | null;
"birthday_year": number | null;
"created_at": string;
"next_attempt_at": string;
"observed_clicked_at": string | null;
};
Insert: {
"id"?: string;
"business_id": string;
"rule_id": string;
"rule_version": number;
"membership_id": string;
"event_key": string;
"state"?: "pending" | "suppressed" | "processing" | "completed" | "failed";
"scheduled_at": string;
"expires_at": string;
"suppression_reason"?: string | null;
"rendered_title": string;
"rendered_body": string;
"rule_snapshot": Json;
"source_purchase_id"?: string | null;
"source_ledger_entry_id"?: string | null;
"birthday_year"?: number | null;
"created_at"?: string;
"next_attempt_at"?: string;
"observed_clicked_at"?: string | null;
};
Update: {
"id"?: string;
"business_id"?: string;
"rule_id"?: string;
"rule_version"?: number;
"membership_id"?: string;
"event_key"?: string;
"state"?: "pending" | "suppressed" | "processing" | "completed" | "failed";
"scheduled_at"?: string;
"expires_at"?: string;
"suppression_reason"?: string | null;
"rendered_title"?: string;
"rendered_body"?: string;
"rule_snapshot"?: Json;
"source_purchase_id"?: string | null;
"source_ledger_entry_id"?: string | null;
"birthday_year"?: number | null;
"created_at"?: string;
"next_attempt_at"?: string;
"observed_clicked_at"?: string | null;
};
Relationships: [
{ foreignKeyName: "automation_runs_business_id_membership_id_fkey"; columns: ["business_id","membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "automation_runs_business_id_rule_id_fkey"; columns: ["business_id","rule_id"]; referencedRelation: "automation_rules"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "automation_runs_business_id_source_ledger_entry_id_fkey"; columns: ["business_id","source_ledger_entry_id"]; referencedRelation: "ledger_entries"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "automation_runs_business_id_source_purchase_id_fkey"; columns: ["business_id","source_purchase_id"]; referencedRelation: "purchases"; referencedColumns: ["business_id","id"]; isOneToOne: false }
];
};
"balances": {
Row: {
"membership_id": string;
"business_id": string;
"units": number;
"ledger_version": number;
"created_at": string;
"updated_at": string;
"row_version": number;
};
Insert: {
"membership_id": string;
"business_id": string;
"units"?: number;
"ledger_version"?: number;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Update: {
"membership_id"?: string;
"business_id"?: string;
"units"?: number;
"ledger_version"?: number;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Relationships: [
{ foreignKeyName: "balances_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "balances_business_id_membership_id_fkey"; columns: ["business_id","membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: true }
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
"branch_hours": {
Row: {
"id": string;
"business_id": string;
"branch_id": string;
"weekday": number;
"opens_at": string;
"closes_at": string;
"created_at": string;
"updated_at": string;
"row_version": number;
};
Insert: {
"id"?: string;
"business_id": string;
"branch_id": string;
"weekday": number;
"opens_at": string;
"closes_at": string;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Update: {
"id"?: string;
"business_id"?: string;
"branch_id"?: string;
"weekday"?: number;
"opens_at"?: string;
"closes_at"?: string;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Relationships: [
{ foreignKeyName: "branch_hours_business_id_branch_id_fkey"; columns: ["business_id","branch_id"]; referencedRelation: "branches"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "branch_hours_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false }
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
"status": "active" | "inactive";
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
"status"?: "active" | "inactive";
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
"status"?: "active" | "inactive";
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
"role": "owner" | "manager" | "cashier";
"status": "active" | "revoked";
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
"role": "owner" | "manager" | "cashier";
"status"?: "active" | "revoked";
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
"role"?: "owner" | "manager" | "cashier";
"status"?: "active" | "revoked";
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
"status": "draft" | "active" | "paused" | "archived";
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
"timezone_locked_at": string | null;
};
Insert: {
"id"?: string;
"slug": string;
"display_name": string;
"description"?: string | null;
"status"?: "draft" | "active" | "paused" | "archived";
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
"timezone_locked_at"?: string | null;
};
Update: {
"id"?: string;
"slug"?: string;
"display_name"?: string;
"description"?: string | null;
"status"?: "draft" | "active" | "paused" | "archived";
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
"timezone_locked_at"?: string | null;
};
Relationships: [
{ foreignKeyName: "businesses_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false },
{ foreignKeyName: "businesses_id_cover_asset_id_fkey"; columns: ["id","cover_asset_id"]; referencedRelation: "media_assets"; referencedColumns: ["business_id","id"]; isOneToOne: true },
{ foreignKeyName: "businesses_id_logo_asset_id_fkey"; columns: ["id","logo_asset_id"]; referencedRelation: "media_assets"; referencedColumns: ["business_id","id"]; isOneToOne: true }
];
};
"campaign_branches": {
Row: {
"business_id": string;
"campaign_version_id": string;
"branch_id": string;
};
Insert: {
"business_id": string;
"campaign_version_id": string;
"branch_id": string;
};
Update: {
"business_id"?: string;
"campaign_version_id"?: string;
"branch_id"?: string;
};
Relationships: [
{ foreignKeyName: "campaign_branches_business_id_branch_id_fkey"; columns: ["business_id","branch_id"]; referencedRelation: "branches"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "campaign_branches_business_id_campaign_version_id_fkey"; columns: ["business_id","campaign_version_id"]; referencedRelation: "campaign_versions"; referencedColumns: ["business_id","id"]; isOneToOne: false }
];
};
"campaign_recipients": {
Row: {
"id": string;
"business_id": string;
"campaign_id": string;
"campaign_version_id": string;
"membership_id": string;
"status": "pending" | "suppressed" | "processing" | "attempted" | "failed";
"suppression_reason": string | null;
"snapshot_at": string;
"observed_clicked_at": string | null;
"next_attempt_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"campaign_id": string;
"campaign_version_id": string;
"membership_id": string;
"status"?: "pending" | "suppressed" | "processing" | "attempted" | "failed";
"suppression_reason"?: string | null;
"snapshot_at"?: string;
"observed_clicked_at"?: string | null;
"next_attempt_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"campaign_id"?: string;
"campaign_version_id"?: string;
"membership_id"?: string;
"status"?: "pending" | "suppressed" | "processing" | "attempted" | "failed";
"suppression_reason"?: string | null;
"snapshot_at"?: string;
"observed_clicked_at"?: string | null;
"next_attempt_at"?: string;
};
Relationships: [
{ foreignKeyName: "campaign_recipients_business_id_campaign_id_campaign_versi_fkey"; columns: ["business_id","campaign_id","campaign_version_id"]; referencedRelation: "campaign_versions"; referencedColumns: ["business_id","campaign_id","id"]; isOneToOne: false },
{ foreignKeyName: "campaign_recipients_business_id_membership_id_fkey"; columns: ["business_id","membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: false }
];
};
"campaign_test_requests": {
Row: {
"id": string;
"business_id": string;
"campaign_id": string;
"campaign_version_id": string;
"business_user_id": string;
"push_device_id": string;
"status": "pending" | "processing" | "provider_accepted" | "failed" | "unknown" | "suppressed";
"created_at": string;
"expires_at": string;
"attempted_at": string | null;
"provider_message_id": string | null;
"error_code": string | null;
};
Insert: {
"id"?: string;
"business_id": string;
"campaign_id": string;
"campaign_version_id": string;
"business_user_id": string;
"push_device_id": string;
"status"?: "pending" | "processing" | "provider_accepted" | "failed" | "unknown" | "suppressed";
"created_at"?: string;
"expires_at": string;
"attempted_at"?: string | null;
"provider_message_id"?: string | null;
"error_code"?: string | null;
};
Update: {
"id"?: string;
"business_id"?: string;
"campaign_id"?: string;
"campaign_version_id"?: string;
"business_user_id"?: string;
"push_device_id"?: string;
"status"?: "pending" | "processing" | "provider_accepted" | "failed" | "unknown" | "suppressed";
"created_at"?: string;
"expires_at"?: string;
"attempted_at"?: string | null;
"provider_message_id"?: string | null;
"error_code"?: string | null;
};
Relationships: [
{ foreignKeyName: "campaign_test_requests_business_id_business_user_id_fkey"; columns: ["business_id","business_user_id"]; referencedRelation: "business_users"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "campaign_test_requests_business_id_campaign_id_campaign_ve_fkey"; columns: ["business_id","campaign_id","campaign_version_id"]; referencedRelation: "campaign_versions"; referencedColumns: ["business_id","campaign_id","id"]; isOneToOne: false },
{ foreignKeyName: "campaign_test_requests_push_device_id_fkey"; columns: ["push_device_id"]; referencedRelation: "push_devices"; referencedColumns: ["id"]; isOneToOne: false }
];
};
"campaign_versions": {
Row: {
"id": string;
"business_id": string;
"campaign_id": string;
"version": number;
"title": string;
"body": string;
"image_asset_id": string | null;
"destination": "card" | "offer";
"offer_id": string | null;
"audience": "all_opted_in" | "inactive" | "reward_ready" | "near_reward";
"inactive_days": number | null;
"near_reward_units": number | null;
"target_reward_version_id": string | null;
"timezone": string;
"expires_at": string;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"campaign_id": string;
"version": number;
"title": string;
"body": string;
"image_asset_id"?: string | null;
"destination": "card" | "offer";
"offer_id"?: string | null;
"audience": "all_opted_in" | "inactive" | "reward_ready" | "near_reward";
"inactive_days"?: number | null;
"near_reward_units"?: number | null;
"target_reward_version_id"?: string | null;
"timezone": string;
"expires_at": string;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"campaign_id"?: string;
"version"?: number;
"title"?: string;
"body"?: string;
"image_asset_id"?: string | null;
"destination"?: "card" | "offer";
"offer_id"?: string | null;
"audience"?: "all_opted_in" | "inactive" | "reward_ready" | "near_reward";
"inactive_days"?: number | null;
"near_reward_units"?: number | null;
"target_reward_version_id"?: string | null;
"timezone"?: string;
"expires_at"?: string;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "campaign_versions_business_id_campaign_id_fkey"; columns: ["business_id","campaign_id"]; referencedRelation: "campaigns"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "campaign_versions_business_id_image_asset_id_fkey"; columns: ["business_id","image_asset_id"]; referencedRelation: "media_assets"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "campaign_versions_business_id_offer_id_fkey"; columns: ["business_id","offer_id"]; referencedRelation: "offers"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "campaign_versions_business_id_target_reward_version_id_fkey"; columns: ["business_id","target_reward_version_id"]; referencedRelation: "reward_versions"; referencedColumns: ["business_id","id"]; isOneToOne: false }
];
};
"campaigns": {
Row: {
"id": string;
"business_id": string;
"name": string;
"status": "draft" | "scheduled" | "processing" | "paused" | "canceled" | "completed" | "completed_with_errors" | "failed";
"current_version_id": string | null;
"created_by": string;
"scheduled_at": string | null;
"started_at": string | null;
"completed_at": string | null;
"created_at": string;
"updated_at": string;
"row_version": number;
"snapshot_cursor": string | null;
};
Insert: {
"id"?: string;
"business_id": string;
"name": string;
"status"?: "draft" | "scheduled" | "processing" | "paused" | "canceled" | "completed" | "completed_with_errors" | "failed";
"current_version_id"?: string | null;
"created_by": string;
"scheduled_at"?: string | null;
"started_at"?: string | null;
"completed_at"?: string | null;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
"snapshot_cursor"?: string | null;
};
Update: {
"id"?: string;
"business_id"?: string;
"name"?: string;
"status"?: "draft" | "scheduled" | "processing" | "paused" | "canceled" | "completed" | "completed_with_errors" | "failed";
"current_version_id"?: string | null;
"created_by"?: string;
"scheduled_at"?: string | null;
"started_at"?: string | null;
"completed_at"?: string | null;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
"snapshot_cursor"?: string | null;
};
Relationships: [
{ foreignKeyName: "campaigns_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "campaigns_business_id_id_current_version_id_fkey"; columns: ["business_id","id","current_version_id"]; referencedRelation: "campaign_versions"; referencedColumns: ["business_id","campaign_id","id"]; isOneToOne: true },
{ foreignKeyName: "campaigns_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"consent_events": {
Row: {
"id": string;
"business_id": string;
"membership_id": string;
"channel": string;
"purpose": string;
"allowed": boolean;
"text_version": string;
"policy_document_id": string;
"source": "customer_settings" | "enrollment" | "staff_recorded_optout";
"actor_user_id": string | null;
"occurred_at": string;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"membership_id": string;
"channel": string;
"purpose": string;
"allowed": boolean;
"text_version": string;
"policy_document_id": string;
"source": "customer_settings" | "enrollment" | "staff_recorded_optout";
"actor_user_id"?: string | null;
"occurred_at"?: string;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"membership_id"?: string;
"channel"?: string;
"purpose"?: string;
"allowed"?: boolean;
"text_version"?: string;
"policy_document_id"?: string;
"source"?: "customer_settings" | "enrollment" | "staff_recorded_optout";
"actor_user_id"?: string | null;
"occurred_at"?: string;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "consent_events_actor_user_id_fkey"; columns: ["actor_user_id"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false },
{ foreignKeyName: "consent_events_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "consent_events_business_id_membership_id_fkey"; columns: ["business_id","membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "consent_events_policy_document_id_fkey"; columns: ["policy_document_id"]; referencedRelation: "policy_documents"; referencedColumns: ["id"]; isOneToOne: false }
];
};
"consent_preferences": {
Row: {
"id": string;
"business_id": string;
"membership_id": string;
"channel": string;
"purpose": string;
"allowed": boolean;
"text_version": string;
"policy_document_id": string;
"changed_at": string;
"source": "customer_settings" | "enrollment" | "staff_recorded_optout";
"created_at": string;
"updated_at": string;
"row_version": number;
};
Insert: {
"id"?: string;
"business_id": string;
"membership_id": string;
"channel": string;
"purpose": string;
"allowed"?: boolean;
"text_version": string;
"policy_document_id": string;
"changed_at": string;
"source": "customer_settings" | "enrollment" | "staff_recorded_optout";
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Update: {
"id"?: string;
"business_id"?: string;
"membership_id"?: string;
"channel"?: string;
"purpose"?: string;
"allowed"?: boolean;
"text_version"?: string;
"policy_document_id"?: string;
"changed_at"?: string;
"source"?: "customer_settings" | "enrollment" | "staff_recorded_optout";
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Relationships: [
{ foreignKeyName: "consent_preferences_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "consent_preferences_business_id_membership_id_fkey"; columns: ["business_id","membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "consent_preferences_policy_document_id_fkey"; columns: ["policy_document_id"]; referencedRelation: "policy_documents"; referencedColumns: ["id"]; isOneToOne: false }
];
};
"contact_frequency_reservations": {
Row: {
"id": string;
"customer_user_id": string;
"business_id": string;
"event_key": string;
"kind": "marketing" | "reward_update";
"business_window_start": string;
"global_window_start": string;
"reserved_at": string;
"state": "reserved" | "attempted" | "released";
};
Insert: {
"id"?: string;
"customer_user_id": string;
"business_id": string;
"event_key": string;
"kind": "marketing" | "reward_update";
"business_window_start": string;
"global_window_start": string;
"reserved_at"?: string;
"state"?: "reserved" | "attempted" | "released";
};
Update: {
"id"?: string;
"customer_user_id"?: string;
"business_id"?: string;
"event_key"?: string;
"kind"?: "marketing" | "reward_update";
"business_window_start"?: string;
"global_window_start"?: string;
"reserved_at"?: string;
"state"?: "reserved" | "attempted" | "released";
};
Relationships: [
{ foreignKeyName: "contact_frequency_reservations_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "contact_frequency_reservations_customer_user_id_fkey"; columns: ["customer_user_id"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"delivery_attempts": {
Row: {
"id": string;
"business_id": string;
"campaign_recipient_id": string | null;
"automation_run_id": string | null;
"push_device_id": string;
"event_key": string;
"attempt_number": number;
"state": "pending" | "provider_accepted" | "failed" | "unknown";
"provider_message_id": string | null;
"error_code": string | null;
"attempted_at": string | null;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"campaign_recipient_id"?: string | null;
"automation_run_id"?: string | null;
"push_device_id": string;
"event_key": string;
"attempt_number": number;
"state"?: "pending" | "provider_accepted" | "failed" | "unknown";
"provider_message_id"?: string | null;
"error_code"?: string | null;
"attempted_at"?: string | null;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"campaign_recipient_id"?: string | null;
"automation_run_id"?: string | null;
"push_device_id"?: string;
"event_key"?: string;
"attempt_number"?: number;
"state"?: "pending" | "provider_accepted" | "failed" | "unknown";
"provider_message_id"?: string | null;
"error_code"?: string | null;
"attempted_at"?: string | null;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "delivery_attempts_business_id_automation_run_id_fkey"; columns: ["business_id","automation_run_id"]; referencedRelation: "automation_runs"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "delivery_attempts_business_id_campaign_recipient_id_fkey"; columns: ["business_id","campaign_recipient_id"]; referencedRelation: "campaign_recipients"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "delivery_attempts_push_device_id_fkey"; columns: ["push_device_id"]; referencedRelation: "push_devices"; referencedColumns: ["id"]; isOneToOne: false }
];
};
"earning_promotions": {
Row: {
"id": string;
"business_id": string;
"name": string;
"status": "draft" | "enabled" | "paused" | "ended";
"current_version_id": string | null;
"row_version": number;
"created_by": string;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"name": string;
"status"?: "draft" | "enabled" | "paused" | "ended";
"current_version_id"?: string | null;
"row_version"?: number;
"created_by": string;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"name"?: string;
"status"?: "draft" | "enabled" | "paused" | "ended";
"current_version_id"?: string | null;
"row_version"?: number;
"created_by"?: string;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "earning_promotions_business_id_current_version_id_fkey"; columns: ["business_id","current_version_id"]; referencedRelation: "promotion_versions"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "earning_promotions_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "earning_promotions_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"enrollment_acceptances": {
Row: {
"id": string;
"business_id": string;
"membership_id": string;
"programme_version_id": string;
"platform_terms_document_id": string;
"privacy_document_id": string;
"accepted_at": string;
"customer_user_id": string | null;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"membership_id": string;
"programme_version_id": string;
"platform_terms_document_id": string;
"privacy_document_id": string;
"accepted_at": string;
"customer_user_id"?: string | null;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"membership_id"?: string;
"programme_version_id"?: string;
"platform_terms_document_id"?: string;
"privacy_document_id"?: string;
"accepted_at"?: string;
"customer_user_id"?: string | null;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "enrollment_acceptances_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "enrollment_acceptances_business_id_membership_id_fkey"; columns: ["business_id","membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "enrollment_acceptances_business_id_programme_version_id_fkey"; columns: ["business_id","programme_version_id"]; referencedRelation: "programme_versions"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "enrollment_acceptances_customer_user_id_fkey"; columns: ["customer_user_id"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false },
{ foreignKeyName: "enrollment_acceptances_platform_terms_document_id_fkey"; columns: ["platform_terms_document_id"]; referencedRelation: "policy_documents"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "enrollment_acceptances_privacy_document_id_fkey"; columns: ["privacy_document_id"]; referencedRelation: "policy_documents"; referencedColumns: ["id"]; isOneToOne: false }
];
};
"export_artifacts": {
Row: {
"id": string;
"export_request_id": string;
"part_number": number;
"storage_path": string;
"bytes": number;
"mime_type": "text/csv" | "application/json";
"expires_at": string;
"created_at": string;
};
Insert: {
"id"?: string;
"export_request_id": string;
"part_number": number;
"storage_path": string;
"bytes": number;
"mime_type": "text/csv" | "application/json";
"expires_at": string;
"created_at"?: string;
};
Update: {
"id"?: string;
"export_request_id"?: string;
"part_number"?: number;
"storage_path"?: string;
"bytes"?: number;
"mime_type"?: "text/csv" | "application/json";
"expires_at"?: string;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "export_artifacts_export_request_id_fkey"; columns: ["export_request_id"]; referencedRelation: "export_requests"; referencedColumns: ["id"]; isOneToOne: false }
];
};
"export_requests": {
Row: {
"id": string;
"business_id": string | null;
"requested_by": string;
"kind": "report" | "contacts" | "account";
"filters": Json;
"columns": Json;
"status": "pending" | "processing" | "completed" | "failed" | "expired";
"expires_at": string | null;
"row_count": number | null;
"error_code": string | null;
"created_at": string;
"updated_at": string;
"row_version": number;
"auth_session_id": string;
"key": string;
"request_hash": string;
"processing_started_at": string | null;
"processing_token": string | null;
"privacy_request_id": string | null;
};
Insert: {
"id"?: string;
"business_id"?: string | null;
"requested_by": string;
"kind": "report" | "contacts" | "account";
"filters": Json;
"columns": Json;
"status"?: "pending" | "processing" | "completed" | "failed" | "expired";
"expires_at"?: string | null;
"row_count"?: number | null;
"error_code"?: string | null;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
"auth_session_id": string;
"key": string;
"request_hash": string;
"processing_started_at"?: string | null;
"processing_token"?: string | null;
"privacy_request_id"?: string | null;
};
Update: {
"id"?: string;
"business_id"?: string | null;
"requested_by"?: string;
"kind"?: "report" | "contacts" | "account";
"filters"?: Json;
"columns"?: Json;
"status"?: "pending" | "processing" | "completed" | "failed" | "expired";
"expires_at"?: string | null;
"row_count"?: number | null;
"error_code"?: string | null;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
"auth_session_id"?: string;
"key"?: string;
"request_hash"?: string;
"processing_started_at"?: string | null;
"processing_token"?: string | null;
"privacy_request_id"?: string | null;
};
Relationships: [
{ foreignKeyName: "export_requests_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "export_requests_privacy_request_id_fkey"; columns: ["privacy_request_id"]; referencedRelation: "privacy_requests"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "export_requests_requested_by_fkey"; columns: ["requested_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"followup_batches": {
Row: {
"id": string;
"business_id": string;
"name": string;
"template_id": string;
"template_version": number;
"template_body": string | null;
"offer_id": string | null;
"audience": "selected_members" | "inactive" | "reward_ready";
"inactive_days": number | null;
"target_reward_version_id": string | null;
"created_by": string;
"created_at": string;
"idempotency_key": string;
"request_hash": string;
"preview_snapshot": Json;
};
Insert: {
"id"?: string;
"business_id": string;
"name": string;
"template_id": string;
"template_version": number;
"template_body"?: string | null;
"offer_id"?: string | null;
"audience": "selected_members" | "inactive" | "reward_ready";
"inactive_days"?: number | null;
"target_reward_version_id"?: string | null;
"created_by": string;
"created_at"?: string;
"idempotency_key": string;
"request_hash": string;
"preview_snapshot": Json;
};
Update: {
"id"?: string;
"business_id"?: string;
"name"?: string;
"template_id"?: string;
"template_version"?: number;
"template_body"?: string | null;
"offer_id"?: string | null;
"audience"?: "selected_members" | "inactive" | "reward_ready";
"inactive_days"?: number | null;
"target_reward_version_id"?: string | null;
"created_by"?: string;
"created_at"?: string;
"idempotency_key"?: string;
"request_hash"?: string;
"preview_snapshot"?: Json;
};
Relationships: [
{ foreignKeyName: "followup_batches_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "followup_batches_business_id_offer_id_fkey"; columns: ["business_id","offer_id"]; referencedRelation: "offers"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "followup_batches_business_id_target_reward_version_id_fkey"; columns: ["business_id","target_reward_version_id"]; referencedRelation: "reward_versions"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "followup_batches_business_id_template_id_fkey"; columns: ["business_id","template_id"]; referencedRelation: "whatsapp_templates"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "followup_batches_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"followup_events": {
Row: {
"id": string;
"business_id": string;
"task_id": string;
"action": "assigned" | "opened" | "marked_sent" | "skipped" | "opted_out" | "reassigned";
"actor_user_id": string;
"occurred_at": string;
"note": string | null;
};
Insert: {
"id"?: string;
"business_id": string;
"task_id": string;
"action": "assigned" | "opened" | "marked_sent" | "skipped" | "opted_out" | "reassigned";
"actor_user_id": string;
"occurred_at"?: string;
"note"?: string | null;
};
Update: {
"id"?: string;
"business_id"?: string;
"task_id"?: string;
"action"?: "assigned" | "opened" | "marked_sent" | "skipped" | "opted_out" | "reassigned";
"actor_user_id"?: string;
"occurred_at"?: string;
"note"?: string | null;
};
Relationships: [
{ foreignKeyName: "followup_events_actor_user_id_fkey"; columns: ["actor_user_id"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false },
{ foreignKeyName: "followup_events_business_id_task_id_fkey"; columns: ["business_id","task_id"]; referencedRelation: "followup_tasks"; referencedColumns: ["business_id","id"]; isOneToOne: false }
];
};
"followup_tasks": {
Row: {
"id": string;
"business_id": string;
"batch_id": string;
"membership_id": string;
"assigned_business_user_id": string | null;
"state": "pending" | "assigned" | "opened" | "staff_marked_sent" | "skipped" | "opted_out";
"rendered_body": string | null;
"opened_at": string | null;
"marked_sent_at": string | null;
"marked_sent_by": string | null;
"skip_reason": string | null;
"last_contact_checked_at": string | null;
"contact_version_at_creation": number;
"lease_owner_business_user_id": string | null;
"lease_expires_at": string | null;
"created_at": string;
"updated_at": string;
"row_version": number;
};
Insert: {
"id"?: string;
"business_id": string;
"batch_id": string;
"membership_id": string;
"assigned_business_user_id"?: string | null;
"state"?: "pending" | "assigned" | "opened" | "staff_marked_sent" | "skipped" | "opted_out";
"rendered_body"?: string | null;
"opened_at"?: string | null;
"marked_sent_at"?: string | null;
"marked_sent_by"?: string | null;
"skip_reason"?: string | null;
"last_contact_checked_at"?: string | null;
"contact_version_at_creation": number;
"lease_owner_business_user_id"?: string | null;
"lease_expires_at"?: string | null;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Update: {
"id"?: string;
"business_id"?: string;
"batch_id"?: string;
"membership_id"?: string;
"assigned_business_user_id"?: string | null;
"state"?: "pending" | "assigned" | "opened" | "staff_marked_sent" | "skipped" | "opted_out";
"rendered_body"?: string | null;
"opened_at"?: string | null;
"marked_sent_at"?: string | null;
"marked_sent_by"?: string | null;
"skip_reason"?: string | null;
"last_contact_checked_at"?: string | null;
"contact_version_at_creation"?: number;
"lease_owner_business_user_id"?: string | null;
"lease_expires_at"?: string | null;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Relationships: [
{ foreignKeyName: "followup_tasks_business_id_assigned_business_user_id_fkey"; columns: ["business_id","assigned_business_user_id"]; referencedRelation: "business_users"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "followup_tasks_business_id_batch_id_fkey"; columns: ["business_id","batch_id"]; referencedRelation: "followup_batches"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "followup_tasks_business_id_lease_owner_business_user_id_fkey"; columns: ["business_id","lease_owner_business_user_id"]; referencedRelation: "business_users"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "followup_tasks_business_id_membership_id_fkey"; columns: ["business_id","membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "followup_tasks_marked_sent_by_fkey"; columns: ["marked_sent_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"invitation_branches": {
Row: {
"business_id": string;
"invitation_id": string;
"branch_id": string;
"created_at": string;
};
Insert: {
"business_id": string;
"invitation_id": string;
"branch_id": string;
"created_at"?: string;
};
Update: {
"business_id"?: string;
"invitation_id"?: string;
"branch_id"?: string;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "invitation_branches_business_id_branch_id_fkey"; columns: ["business_id","branch_id"]; referencedRelation: "branches"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "invitation_branches_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "invitation_branches_business_id_invitation_id_fkey"; columns: ["business_id","invitation_id"]; referencedRelation: "staff_invitations"; referencedColumns: ["business_id","id"]; isOneToOne: false }
];
};
"invoices": {
Row: {
"id": string;
"business_id": string;
"subscription_id": string;
"plan_version_id": string;
"reference": string;
"amount_paisa": number;
"currency": string;
"period_start": string;
"period_end": string;
"due_at": string;
"status": "draft" | "issued" | "paid" | "void" | "overdue";
"issued_at": string | null;
"paid_at": string | null;
"created_at": string;
"updated_at": string;
"row_version": number;
};
Insert: {
"id"?: string;
"business_id": string;
"subscription_id": string;
"plan_version_id": string;
"reference": string;
"amount_paisa": number;
"currency"?: string;
"period_start": string;
"period_end": string;
"due_at": string;
"status"?: "draft" | "issued" | "paid" | "void" | "overdue";
"issued_at"?: string | null;
"paid_at"?: string | null;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Update: {
"id"?: string;
"business_id"?: string;
"subscription_id"?: string;
"plan_version_id"?: string;
"reference"?: string;
"amount_paisa"?: number;
"currency"?: string;
"period_start"?: string;
"period_end"?: string;
"due_at"?: string;
"status"?: "draft" | "issued" | "paid" | "void" | "overdue";
"issued_at"?: string | null;
"paid_at"?: string | null;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Relationships: [
{ foreignKeyName: "invoices_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "invoices_business_id_subscription_id_fkey"; columns: ["business_id","subscription_id"]; referencedRelation: "subscriptions"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "invoices_plan_version_id_fkey"; columns: ["plan_version_id"]; referencedRelation: "plan_versions"; referencedColumns: ["id"]; isOneToOne: false }
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
"ledger_entries": {
Row: {
"id": string;
"business_id": string;
"membership_id": string;
"entry_kind": "purchase_base" | "promotion_bonus" | "referral_bonus" | "redemption" | "adjustment" | "reversal";
"units": number;
"purchase_id": string | null;
"redemption_id": string | null;
"referral_claim_id": string | null;
"adjustment_id": string | null;
"reverses_entry_id": string | null;
"purchase_reversal_id": string | null;
"redemption_reversal_id": string | null;
"occurred_at": string;
"actor_user_id": string | null;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"membership_id": string;
"entry_kind": "purchase_base" | "promotion_bonus" | "referral_bonus" | "redemption" | "adjustment" | "reversal";
"units": number;
"purchase_id"?: string | null;
"redemption_id"?: string | null;
"referral_claim_id"?: string | null;
"adjustment_id"?: string | null;
"reverses_entry_id"?: string | null;
"purchase_reversal_id"?: string | null;
"redemption_reversal_id"?: string | null;
"occurred_at"?: string;
"actor_user_id"?: string | null;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"membership_id"?: string;
"entry_kind"?: "purchase_base" | "promotion_bonus" | "referral_bonus" | "redemption" | "adjustment" | "reversal";
"units"?: number;
"purchase_id"?: string | null;
"redemption_id"?: string | null;
"referral_claim_id"?: string | null;
"adjustment_id"?: string | null;
"reverses_entry_id"?: string | null;
"purchase_reversal_id"?: string | null;
"redemption_reversal_id"?: string | null;
"occurred_at"?: string;
"actor_user_id"?: string | null;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "ledger_entries_actor_user_id_fkey"; columns: ["actor_user_id"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false },
{ foreignKeyName: "ledger_entries_business_id_adjustment_id_fkey"; columns: ["business_id","adjustment_id"]; referencedRelation: "adjustments"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "ledger_entries_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "ledger_entries_business_id_membership_id_fkey"; columns: ["business_id","membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "ledger_entries_business_id_purchase_id_fkey"; columns: ["business_id","purchase_id"]; referencedRelation: "purchases"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "ledger_entries_business_id_purchase_reversal_id_fkey"; columns: ["business_id","purchase_reversal_id"]; referencedRelation: "purchase_reversals"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "ledger_entries_business_id_redemption_id_fkey"; columns: ["business_id","redemption_id"]; referencedRelation: "redemptions"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "ledger_entries_business_id_redemption_reversal_id_fkey"; columns: ["business_id","redemption_reversal_id"]; referencedRelation: "redemption_reversals"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "ledger_entries_business_id_referral_claim_id_fkey"; columns: ["business_id","referral_claim_id"]; referencedRelation: "referral_claims"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "ledger_entries_business_id_reverses_entry_id_fkey"; columns: ["business_id","reverses_entry_id"]; referencedRelation: "ledger_entries"; referencedColumns: ["business_id","id"]; isOneToOne: true }
];
};
"loyalty_programmes": {
Row: {
"id": string;
"business_id": string;
"type": "stamps" | "points";
"status": "draft" | "published" | "paused";
"name": string;
"created_at": string;
"updated_at": string;
"row_version": number;
"is_primary": boolean;
};
Insert: {
"id"?: string;
"business_id": string;
"type": "stamps" | "points";
"status"?: "draft" | "published" | "paused";
"name": string;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
"is_primary"?: boolean;
};
Update: {
"id"?: string;
"business_id"?: string;
"type"?: "stamps" | "points";
"status"?: "draft" | "published" | "paused";
"name"?: string;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
"is_primary"?: boolean;
};
Relationships: [
{ foreignKeyName: "loyalty_programmes_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false }
];
};
"media_assets": {
Row: {
"id": string;
"business_id": string;
"storage_path": string;
"kind": "logo" | "cover" | "offer" | "payment_proof";
"mime_type": "image/jpeg" | "image/png" | "image/webp";
"bytes": number;
"width": number | null;
"height": number | null;
"uploaded_by": string;
"validation_status": "pending" | "accepted" | "rejected";
"visibility": "public_brand" | "private";
"created_at": string;
"updated_at": string;
"row_version": number;
};
Insert: {
"id"?: string;
"business_id": string;
"storage_path": string;
"kind": "logo" | "cover" | "offer" | "payment_proof";
"mime_type": "image/jpeg" | "image/png" | "image/webp";
"bytes": number;
"width"?: number | null;
"height"?: number | null;
"uploaded_by": string;
"validation_status"?: "pending" | "accepted" | "rejected";
"visibility": "public_brand" | "private";
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Update: {
"id"?: string;
"business_id"?: string;
"storage_path"?: string;
"kind"?: "logo" | "cover" | "offer" | "payment_proof";
"mime_type"?: "image/jpeg" | "image/png" | "image/webp";
"bytes"?: number;
"width"?: number | null;
"height"?: number | null;
"uploaded_by"?: string;
"validation_status"?: "pending" | "accepted" | "rejected";
"visibility"?: "public_brand" | "private";
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Relationships: [
{ foreignKeyName: "media_assets_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "media_assets_uploaded_by_fkey"; columns: ["uploaded_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"membership_contacts": {
Row: {
"membership_id": string;
"business_id": string;
"phone_e164": string | null;
"phone_status": "unverified" | "staff_confirmed";
"phone_confirmed_at": string | null;
"phone_confirmed_by": string | null;
"shared_email": string | null;
"contact_changed_at": string;
"created_at": string;
"updated_at": string;
"row_version": number;
};
Insert: {
"membership_id": string;
"business_id": string;
"phone_e164"?: string | null;
"phone_status"?: "unverified" | "staff_confirmed";
"phone_confirmed_at"?: string | null;
"phone_confirmed_by"?: string | null;
"shared_email"?: string | null;
"contact_changed_at"?: string;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Update: {
"membership_id"?: string;
"business_id"?: string;
"phone_e164"?: string | null;
"phone_status"?: "unverified" | "staff_confirmed";
"phone_confirmed_at"?: string | null;
"phone_confirmed_by"?: string | null;
"shared_email"?: string | null;
"contact_changed_at"?: string;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Relationships: [
{ foreignKeyName: "membership_contacts_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "membership_contacts_business_id_membership_id_fkey"; columns: ["business_id","membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: true },
{ foreignKeyName: "membership_contacts_phone_confirmed_by_fkey"; columns: ["phone_confirmed_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"membership_handles": {
Row: {
"id": string;
"business_id": string;
"membership_id": string;
"handle_hash": string;
"handle_ciphertext": string;
"encryption_key_id": string;
"status": "active" | "revoked";
"revoked_at": string | null;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"membership_id": string;
"handle_hash": string;
"handle_ciphertext": string;
"encryption_key_id": string;
"status"?: "active" | "revoked";
"revoked_at"?: string | null;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"membership_id"?: string;
"handle_hash"?: string;
"handle_ciphertext"?: string;
"encryption_key_id"?: string;
"status"?: "active" | "revoked";
"revoked_at"?: string | null;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "membership_handles_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "membership_handles_business_id_membership_id_fkey"; columns: ["business_id","membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: false }
];
};
"memberships": {
Row: {
"id": string;
"business_id": string;
"customer_user_id": string | null;
"display_name": string;
"joined_at": string;
"joined_branch_id": string | null;
"status": "active" | "left" | "suspended" | "anonymized";
"left_at": string | null;
"last_qualifying_purchase_at": string | null;
"created_at": string;
"updated_at": string;
"row_version": number;
"programme_id": string;
};
Insert: {
"id"?: string;
"business_id": string;
"customer_user_id"?: string | null;
"display_name": string;
"joined_at"?: string;
"joined_branch_id"?: string | null;
"status"?: "active" | "left" | "suspended" | "anonymized";
"left_at"?: string | null;
"last_qualifying_purchase_at"?: string | null;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
"programme_id": string;
};
Update: {
"id"?: string;
"business_id"?: string;
"customer_user_id"?: string | null;
"display_name"?: string;
"joined_at"?: string;
"joined_branch_id"?: string | null;
"status"?: "active" | "left" | "suspended" | "anonymized";
"left_at"?: string | null;
"last_qualifying_purchase_at"?: string | null;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
"programme_id"?: string;
};
Relationships: [
{ foreignKeyName: "membership_programme_business_fkey"; columns: ["business_id","programme_id"]; referencedRelation: "loyalty_programmes"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "memberships_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "memberships_business_id_joined_branch_id_fkey"; columns: ["business_id","joined_branch_id"]; referencedRelation: "branches"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "memberships_customer_user_id_fkey"; columns: ["customer_user_id"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"offer_branches": {
Row: {
"business_id": string;
"offer_id": string;
"branch_id": string;
};
Insert: {
"business_id": string;
"offer_id": string;
"branch_id": string;
};
Update: {
"business_id"?: string;
"offer_id"?: string;
"branch_id"?: string;
};
Relationships: [
{ foreignKeyName: "offer_branches_business_id_branch_id_fkey"; columns: ["business_id","branch_id"]; referencedRelation: "branches"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "offer_branches_business_id_offer_id_fkey"; columns: ["business_id","offer_id"]; referencedRelation: "offers"; referencedColumns: ["business_id","id"]; isOneToOne: false }
];
};
"offer_claim_intents": {
Row: {
"id": string;
"business_id": string;
"offer_claim_id": string;
"membership_id": string;
"token_hash": string;
"expires_at": string;
"consumed_at": string | null;
"canceled_at": string | null;
"created_by": string;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"offer_claim_id": string;
"membership_id": string;
"token_hash": string;
"expires_at": string;
"consumed_at"?: string | null;
"canceled_at"?: string | null;
"created_by": string;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"offer_claim_id"?: string;
"membership_id"?: string;
"token_hash"?: string;
"expires_at"?: string;
"consumed_at"?: string | null;
"canceled_at"?: string | null;
"created_by"?: string;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "offer_claim_intents_business_id_membership_id_fkey"; columns: ["business_id","membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "offer_claim_intents_business_id_offer_claim_id_fkey"; columns: ["business_id","offer_claim_id"]; referencedRelation: "offer_claims"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "offer_claim_intents_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"offer_claims": {
Row: {
"id": string;
"business_id": string;
"offer_id": string;
"membership_id": string;
"campaign_id": string | null;
"automation_run_id": string | null;
"status": "claimed" | "fulfilled" | "expired" | "voided";
"claimed_at": string;
"fulfilled_at": string | null;
"fulfilled_by": string | null;
"branch_id": string | null;
"purchase_id": string | null;
"void_reason": string | null;
"applied_discount_paisa": number | null;
"benefit_description": string | null;
};
Insert: {
"id"?: string;
"business_id": string;
"offer_id": string;
"membership_id": string;
"campaign_id"?: string | null;
"automation_run_id"?: string | null;
"status"?: "claimed" | "fulfilled" | "expired" | "voided";
"claimed_at"?: string;
"fulfilled_at"?: string | null;
"fulfilled_by"?: string | null;
"branch_id"?: string | null;
"purchase_id"?: string | null;
"void_reason"?: string | null;
"applied_discount_paisa"?: number | null;
"benefit_description"?: string | null;
};
Update: {
"id"?: string;
"business_id"?: string;
"offer_id"?: string;
"membership_id"?: string;
"campaign_id"?: string | null;
"automation_run_id"?: string | null;
"status"?: "claimed" | "fulfilled" | "expired" | "voided";
"claimed_at"?: string;
"fulfilled_at"?: string | null;
"fulfilled_by"?: string | null;
"branch_id"?: string | null;
"purchase_id"?: string | null;
"void_reason"?: string | null;
"applied_discount_paisa"?: number | null;
"benefit_description"?: string | null;
};
Relationships: [
{ foreignKeyName: "offer_claims_business_id_automation_run_id_fkey"; columns: ["business_id","automation_run_id"]; referencedRelation: "automation_runs"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "offer_claims_business_id_branch_id_fkey"; columns: ["business_id","branch_id"]; referencedRelation: "branches"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "offer_claims_business_id_campaign_id_fkey"; columns: ["business_id","campaign_id"]; referencedRelation: "campaigns"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "offer_claims_business_id_membership_id_fkey"; columns: ["business_id","membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "offer_claims_business_id_offer_id_fkey"; columns: ["business_id","offer_id"]; referencedRelation: "offers"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "offer_claims_business_id_purchase_id_fkey"; columns: ["business_id","purchase_id"]; referencedRelation: "purchases"; referencedColumns: ["business_id","id"]; isOneToOne: true },
{ foreignKeyName: "offer_claims_fulfilled_by_fkey"; columns: ["fulfilled_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"offer_recipients": {
Row: {
"business_id": string;
"offer_id": string;
"membership_id": string;
"valid_from": string;
"valid_until": string;
"automation_run_id": string | null;
};
Insert: {
"business_id": string;
"offer_id": string;
"membership_id": string;
"valid_from": string;
"valid_until": string;
"automation_run_id"?: string | null;
};
Update: {
"business_id"?: string;
"offer_id"?: string;
"membership_id"?: string;
"valid_from"?: string;
"valid_until"?: string;
"automation_run_id"?: string | null;
};
Relationships: [
{ foreignKeyName: "offer_recipients_business_id_automation_run_id_fkey"; columns: ["business_id","automation_run_id"]; referencedRelation: "automation_runs"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "offer_recipients_business_id_membership_id_fkey"; columns: ["business_id","membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "offer_recipients_business_id_offer_id_fkey"; columns: ["business_id","offer_id"]; referencedRelation: "offers"; referencedColumns: ["business_id","id"]; isOneToOne: false }
];
};
"offers": {
Row: {
"id": string;
"business_id": string;
"kind": "informational" | "discount" | "treat";
"title": string;
"description": string;
"terms": string;
"image_asset_id": string | null;
"starts_at": string;
"expires_at": string;
"status": "draft" | "published" | "paused" | "expired";
"audience": "all_members" | "recipient_list";
"is_automation_template": boolean;
"source_template_id": string | null;
"generated_by_run_id": string | null;
"discount_percent": number | null;
"minimum_spend_paisa": number;
"max_discount_paisa": number | null;
"created_by": string;
"created_at": string;
"updated_at": string;
"row_version": number;
};
Insert: {
"id"?: string;
"business_id": string;
"kind": "informational" | "discount" | "treat";
"title": string;
"description": string;
"terms"?: string;
"image_asset_id"?: string | null;
"starts_at": string;
"expires_at": string;
"status"?: "draft" | "published" | "paused" | "expired";
"audience": "all_members" | "recipient_list";
"is_automation_template"?: boolean;
"source_template_id"?: string | null;
"generated_by_run_id"?: string | null;
"discount_percent"?: number | null;
"minimum_spend_paisa"?: number;
"max_discount_paisa"?: number | null;
"created_by": string;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Update: {
"id"?: string;
"business_id"?: string;
"kind"?: "informational" | "discount" | "treat";
"title"?: string;
"description"?: string;
"terms"?: string;
"image_asset_id"?: string | null;
"starts_at"?: string;
"expires_at"?: string;
"status"?: "draft" | "published" | "paused" | "expired";
"audience"?: "all_members" | "recipient_list";
"is_automation_template"?: boolean;
"source_template_id"?: string | null;
"generated_by_run_id"?: string | null;
"discount_percent"?: number | null;
"minimum_spend_paisa"?: number;
"max_discount_paisa"?: number | null;
"created_by"?: string;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Relationships: [
{ foreignKeyName: "offers_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "offers_business_id_generated_by_run_id_fkey"; columns: ["business_id","generated_by_run_id"]; referencedRelation: "automation_runs"; referencedColumns: ["business_id","id"]; isOneToOne: true },
{ foreignKeyName: "offers_business_id_image_asset_id_fkey"; columns: ["business_id","image_asset_id"]; referencedRelation: "media_assets"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "offers_business_id_source_template_id_fkey"; columns: ["business_id","source_template_id"]; referencedRelation: "offers"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "offers_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"operational_checks": {
Row: {
"name": "worker_heartbeat" | "db_readiness" | "backup" | "restore_rehearsal" | "ledger_reconciliation";
"checked_at": string;
"status": "ok" | "degraded" | "failed" | "unknown";
"safe_details": Json;
};
Insert: {
"name": "worker_heartbeat" | "db_readiness" | "backup" | "restore_rehearsal" | "ledger_reconciliation";
"checked_at": string;
"status": "ok" | "degraded" | "failed" | "unknown";
"safe_details": Json;
};
Update: {
"name"?: "worker_heartbeat" | "db_readiness" | "backup" | "restore_rehearsal" | "ledger_reconciliation";
"checked_at"?: string;
"status"?: "ok" | "degraded" | "failed" | "unknown";
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
"state": "pending" | "dispatched" | "failed";
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
"state"?: "pending" | "dispatched" | "failed";
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
"state"?: "pending" | "dispatched" | "failed";
"dispatched_at"?: string | null;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Relationships: [
{ foreignKeyName: "outbox_events_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false }
];
};
"payment_events": {
Row: {
"id": string;
"business_id": string;
"invoice_id": string;
"submission_id": string | null;
"verified_amount_paisa": number;
"method": "bank_transfer" | "merchant_wallet";
"provider_or_bank": string;
"external_reference": string;
"verified_at": string;
"verified_by": string;
"event": "confirmed" | "correction";
"corrects_event_id": string | null;
"reason": string | null;
"idempotency_key": string;
"request_hash": string;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"invoice_id": string;
"submission_id"?: string | null;
"verified_amount_paisa": number;
"method": "bank_transfer" | "merchant_wallet";
"provider_or_bank": string;
"external_reference": string;
"verified_at"?: string;
"verified_by": string;
"event": "confirmed" | "correction";
"corrects_event_id"?: string | null;
"reason"?: string | null;
"idempotency_key": string;
"request_hash": string;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"invoice_id"?: string;
"submission_id"?: string | null;
"verified_amount_paisa"?: number;
"method"?: "bank_transfer" | "merchant_wallet";
"provider_or_bank"?: string;
"external_reference"?: string;
"verified_at"?: string;
"verified_by"?: string;
"event"?: "confirmed" | "correction";
"corrects_event_id"?: string | null;
"reason"?: string | null;
"idempotency_key"?: string;
"request_hash"?: string;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "payment_events_business_id_corrects_event_id_fkey"; columns: ["business_id","corrects_event_id"]; referencedRelation: "payment_events"; referencedColumns: ["business_id","id"]; isOneToOne: true },
{ foreignKeyName: "payment_events_business_id_invoice_id_fkey"; columns: ["business_id","invoice_id"]; referencedRelation: "invoices"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "payment_events_business_id_submission_id_fkey"; columns: ["business_id","submission_id"]; referencedRelation: "payment_submissions"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "payment_events_verified_by_fkey"; columns: ["verified_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"payment_submissions": {
Row: {
"id": string;
"business_id": string;
"invoice_id": string;
"claimed_amount_paisa": number;
"method": "bank_transfer" | "merchant_wallet";
"claimed_reference": string;
"proof_asset_id": string | null;
"submitted_by": string;
"status": "pending_review" | "accepted" | "rejected";
"review_note": string | null;
"idempotency_key": string;
"request_hash": string;
"created_at": string;
"updated_at": string;
"row_version": number;
};
Insert: {
"id"?: string;
"business_id": string;
"invoice_id": string;
"claimed_amount_paisa": number;
"method": "bank_transfer" | "merchant_wallet";
"claimed_reference": string;
"proof_asset_id"?: string | null;
"submitted_by": string;
"status"?: "pending_review" | "accepted" | "rejected";
"review_note"?: string | null;
"idempotency_key": string;
"request_hash": string;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Update: {
"id"?: string;
"business_id"?: string;
"invoice_id"?: string;
"claimed_amount_paisa"?: number;
"method"?: "bank_transfer" | "merchant_wallet";
"claimed_reference"?: string;
"proof_asset_id"?: string | null;
"submitted_by"?: string;
"status"?: "pending_review" | "accepted" | "rejected";
"review_note"?: string | null;
"idempotency_key"?: string;
"request_hash"?: string;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Relationships: [
{ foreignKeyName: "payment_submissions_business_id_invoice_id_fkey"; columns: ["business_id","invoice_id"]; referencedRelation: "invoices"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "payment_submissions_business_id_proof_asset_id_fkey"; columns: ["business_id","proof_asset_id"]; referencedRelation: "media_assets"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "payment_submissions_submitted_by_fkey"; columns: ["submitted_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"plan_versions": {
Row: {
"id": string;
"plan_id": string;
"version": number;
"price_paisa": number;
"billing_period": "monthly" | "annual";
"branch_limit": number;
"staff_limit": number;
"member_limit": number | null;
"monthly_campaign_limit": number | null;
"trial_days": number;
"status": "draft" | "published";
"published_at": string | null;
"created_at": string;
};
Insert: {
"id"?: string;
"plan_id": string;
"version": number;
"price_paisa": number;
"billing_period": "monthly" | "annual";
"branch_limit": number;
"staff_limit": number;
"member_limit"?: number | null;
"monthly_campaign_limit"?: number | null;
"trial_days"?: number;
"status"?: "draft" | "published";
"published_at"?: string | null;
"created_at"?: string;
};
Update: {
"id"?: string;
"plan_id"?: string;
"version"?: number;
"price_paisa"?: number;
"billing_period"?: "monthly" | "annual";
"branch_limit"?: number;
"staff_limit"?: number;
"member_limit"?: number | null;
"monthly_campaign_limit"?: number | null;
"trial_days"?: number;
"status"?: "draft" | "published";
"published_at"?: string | null;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "plan_versions_plan_id_fkey"; columns: ["plan_id"]; referencedRelation: "plans"; referencedColumns: ["id"]; isOneToOne: false }
];
};
"plans": {
Row: {
"id": string;
"code": string;
"name": string;
"active": boolean;
"created_at": string;
"updated_at": string;
"row_version": number;
};
Insert: {
"id"?: string;
"code": string;
"name": string;
"active"?: boolean;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Update: {
"id"?: string;
"code"?: string;
"name"?: string;
"active"?: boolean;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Relationships: [

];
};
"platform_admins": {
Row: {
"user_id": string;
"active": boolean;
"can_reconcile_billing": boolean;
"can_manage_support": boolean;
"created_at": string;
"updated_at": string;
"row_version": number;
};
Insert: {
"user_id": string;
"active": boolean;
"can_reconcile_billing": boolean;
"can_manage_support": boolean;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Update: {
"user_id"?: string;
"active"?: boolean;
"can_reconcile_billing"?: boolean;
"can_manage_support"?: boolean;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Relationships: [
{ foreignKeyName: "platform_admins_user_id_fkey"; columns: ["user_id"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: true }
];
};
"platform_settings": {
Row: {
"key": "grace_days" | "notification_retention_days" | "log_retention_days" | "referral_visit_retention_days" | "device_retention_days" | "temporary_retention_hours" | "billing_instructions" | "canonical_providers" | "financial_retention_policy" | "backup_coverage";
"value": Json;
"updated_at": string;
"updated_by": string | null;
};
Insert: {
"key": "grace_days" | "notification_retention_days" | "log_retention_days" | "referral_visit_retention_days" | "device_retention_days" | "temporary_retention_hours" | "billing_instructions" | "canonical_providers" | "financial_retention_policy" | "backup_coverage";
"value": Json;
"updated_at"?: string;
"updated_by"?: string | null;
};
Update: {
"key"?: "grace_days" | "notification_retention_days" | "log_retention_days" | "referral_visit_retention_days" | "device_retention_days" | "temporary_retention_hours" | "billing_instructions" | "canonical_providers" | "financial_retention_policy" | "backup_coverage";
"value"?: Json;
"updated_at"?: string;
"updated_by"?: string | null;
};
Relationships: [
{ foreignKeyName: "platform_settings_updated_by_fkey"; columns: ["updated_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"policy_documents": {
Row: {
"id": string;
"business_id": string | null;
"kind": "platform_terms" | "privacy" | "push_marketing" | "push_reward" | "push_birthday" | "inbox_birthday" | "whatsapp_marketing";
"version": string;
"body": string;
"published_at": string | null;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id"?: string | null;
"kind": "platform_terms" | "privacy" | "push_marketing" | "push_reward" | "push_birthday" | "inbox_birthday" | "whatsapp_marketing";
"version": string;
"body": string;
"published_at"?: string | null;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string | null;
"kind"?: "platform_terms" | "privacy" | "push_marketing" | "push_reward" | "push_birthday" | "inbox_birthday" | "whatsapp_marketing";
"version"?: string;
"body"?: string;
"published_at"?: string | null;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "policy_documents_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false }
];
};
"privacy_requests": {
Row: {
"id": string;
"customer_user_id": string | null;
"membership_id": string | null;
"business_id": string | null;
"kind": "export" | "delete_membership" | "delete_account";
"status": "pending" | "processing" | "blocked" | "completed" | "failed";
"requested_at": string;
"completed_at": string | null;
"result_storage_path": string | null;
"result_expires_at": string | null;
"error_code": string | null;
"retained_categories": Json;
"export_request_id": string | null;
"idempotency_key": string;
"request_hash": string;
"processing_token": string | null;
"processing_started_at": string | null;
"database_completed_at": string | null;
"auth_identity_id": string | null;
"created_at": string;
"updated_at": string;
"row_version": number;
};
Insert: {
"id"?: string;
"customer_user_id"?: string | null;
"membership_id"?: string | null;
"business_id"?: string | null;
"kind": "export" | "delete_membership" | "delete_account";
"status"?: "pending" | "processing" | "blocked" | "completed" | "failed";
"requested_at"?: string;
"completed_at"?: string | null;
"result_storage_path"?: string | null;
"result_expires_at"?: string | null;
"error_code"?: string | null;
"retained_categories"?: Json;
"export_request_id"?: string | null;
"idempotency_key": string;
"request_hash": string;
"processing_token"?: string | null;
"processing_started_at"?: string | null;
"database_completed_at"?: string | null;
"auth_identity_id"?: string | null;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Update: {
"id"?: string;
"customer_user_id"?: string | null;
"membership_id"?: string | null;
"business_id"?: string | null;
"kind"?: "export" | "delete_membership" | "delete_account";
"status"?: "pending" | "processing" | "blocked" | "completed" | "failed";
"requested_at"?: string;
"completed_at"?: string | null;
"result_storage_path"?: string | null;
"result_expires_at"?: string | null;
"error_code"?: string | null;
"retained_categories"?: Json;
"export_request_id"?: string | null;
"idempotency_key"?: string;
"request_hash"?: string;
"processing_token"?: string | null;
"processing_started_at"?: string | null;
"database_completed_at"?: string | null;
"auth_identity_id"?: string | null;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Relationships: [
{ foreignKeyName: "privacy_requests_business_id_membership_id_fkey"; columns: ["business_id","membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "privacy_requests_customer_user_id_fkey"; columns: ["customer_user_id"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false },
{ foreignKeyName: "privacy_requests_export_request_id_fkey"; columns: ["export_request_id"]; referencedRelation: "export_requests"; referencedColumns: ["id"]; isOneToOne: false }
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
{ foreignKeyName: "profiles_auth_user_id_fkey"; columns: ["auth_user_id"]; referencedRelation: "users"; referencedColumns: ["id"]; isOneToOne: true }
];
};
"programme_versions": {
Row: {
"id": string;
"business_id": string;
"programme_id": string;
"version": number;
"status": "draft" | "published";
"effective_at": string;
"published_at": string | null;
"minimum_spend_paisa": number;
"stamps_per_purchase": number | null;
"spend_step_paisa": number | null;
"units_per_step": number | null;
"max_base_units_per_purchase": number;
"terms": string;
"created_by": string;
"created_at": string;
"name": string;
};
Insert: {
"id"?: string;
"business_id": string;
"programme_id": string;
"version": number;
"status"?: "draft" | "published";
"effective_at": string;
"published_at"?: string | null;
"minimum_spend_paisa"?: number;
"stamps_per_purchase"?: number | null;
"spend_step_paisa"?: number | null;
"units_per_step"?: number | null;
"max_base_units_per_purchase"?: number;
"terms": string;
"created_by": string;
"created_at"?: string;
"name": string;
};
Update: {
"id"?: string;
"business_id"?: string;
"programme_id"?: string;
"version"?: number;
"status"?: "draft" | "published";
"effective_at"?: string;
"published_at"?: string | null;
"minimum_spend_paisa"?: number;
"stamps_per_purchase"?: number | null;
"spend_step_paisa"?: number | null;
"units_per_step"?: number | null;
"max_base_units_per_purchase"?: number;
"terms"?: string;
"created_by"?: string;
"created_at"?: string;
"name"?: string;
};
Relationships: [
{ foreignKeyName: "programme_versions_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "programme_versions_business_id_programme_id_fkey"; columns: ["business_id","programme_id"]; referencedRelation: "loyalty_programmes"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "programme_versions_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"promotion_branches": {
Row: {
"business_id": string;
"promotion_version_id": string;
"branch_id": string;
};
Insert: {
"business_id": string;
"promotion_version_id": string;
"branch_id": string;
};
Update: {
"business_id"?: string;
"promotion_version_id"?: string;
"branch_id"?: string;
};
Relationships: [
{ foreignKeyName: "promotion_branches_business_id_branch_id_fkey"; columns: ["business_id","branch_id"]; referencedRelation: "branches"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "promotion_branches_business_id_promotion_version_id_fkey"; columns: ["business_id","promotion_version_id"]; referencedRelation: "promotion_versions"; referencedColumns: ["business_id","id"]; isOneToOne: false }
];
};
"promotion_usage": {
Row: {
"id": string;
"business_id": string;
"promotion_version_id": string;
"promotion_id": string;
"membership_id": string;
"purchase_id": string;
"local_date": string;
"bonus_units": number;
"reversed_at": string | null;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"promotion_version_id": string;
"promotion_id": string;
"membership_id": string;
"purchase_id": string;
"local_date": string;
"bonus_units": number;
"reversed_at"?: string | null;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"promotion_version_id"?: string;
"promotion_id"?: string;
"membership_id"?: string;
"purchase_id"?: string;
"local_date"?: string;
"bonus_units"?: number;
"reversed_at"?: string | null;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "promotion_usage_business_id_membership_id_fkey"; columns: ["business_id","membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "promotion_usage_business_id_promotion_id_fkey"; columns: ["business_id","promotion_id"]; referencedRelation: "earning_promotions"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "promotion_usage_business_id_promotion_version_id_fkey"; columns: ["business_id","promotion_version_id"]; referencedRelation: "promotion_versions"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "promotion_usage_business_id_purchase_id_fkey"; columns: ["business_id","purchase_id"]; referencedRelation: "purchases"; referencedColumns: ["business_id","id"]; isOneToOne: true }
];
};
"promotion_versions": {
Row: {
"id": string;
"business_id": string;
"promotion_id": string;
"version": number;
"status": "draft" | "published";
"starts_on": string;
"ends_on": string;
"weekdays": unknown;
"starts_at": string;
"ends_at": string;
"timezone": string;
"multiplier": number;
"minimum_spend_paisa": number;
"member_daily_cap": number | null;
"max_bonus_units_per_purchase": number;
"effective_at": string;
"published_at": string | null;
"created_by": string;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"promotion_id": string;
"version": number;
"status"?: "draft" | "published";
"starts_on": string;
"ends_on": string;
"weekdays": unknown;
"starts_at": string;
"ends_at": string;
"timezone": string;
"multiplier"?: number;
"minimum_spend_paisa"?: number;
"member_daily_cap"?: number | null;
"max_bonus_units_per_purchase"?: number;
"effective_at": string;
"published_at"?: string | null;
"created_by": string;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"promotion_id"?: string;
"version"?: number;
"status"?: "draft" | "published";
"starts_on"?: string;
"ends_on"?: string;
"weekdays"?: unknown;
"starts_at"?: string;
"ends_at"?: string;
"timezone"?: string;
"multiplier"?: number;
"minimum_spend_paisa"?: number;
"member_daily_cap"?: number | null;
"max_bonus_units_per_purchase"?: number;
"effective_at"?: string;
"published_at"?: string | null;
"created_by"?: string;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "promotion_versions_business_id_promotion_id_fkey"; columns: ["business_id","promotion_id"]; referencedRelation: "earning_promotions"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "promotion_versions_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"purchase_reversals": {
Row: {
"id": string;
"business_id": string;
"purchase_id": string;
"reason": string;
"actor_user_id": string;
"reversed_at": string;
"idempotency_key": string;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"purchase_id": string;
"reason": string;
"actor_user_id": string;
"reversed_at"?: string;
"idempotency_key": string;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"purchase_id"?: string;
"reason"?: string;
"actor_user_id"?: string;
"reversed_at"?: string;
"idempotency_key"?: string;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "purchase_reversals_actor_user_id_fkey"; columns: ["actor_user_id"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false },
{ foreignKeyName: "purchase_reversals_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "purchase_reversals_business_id_purchase_id_fkey"; columns: ["business_id","purchase_id"]; referencedRelation: "purchases"; referencedColumns: ["business_id","id"]; isOneToOne: true }
];
};
"purchases": {
Row: {
"id": string;
"business_id": string;
"branch_id": string;
"membership_id": string;
"programme_version_id": string;
"recorded_bill_paisa": number;
"eligible_spend_paisa": number;
"base_units": number;
"promotion_bonus_units": number;
"promotion_version_id": string | null;
"receipt_reference": string | null;
"qualifying_purchase_confirmed": boolean;
"qualifies_for_loyalty": boolean;
"offer_eligible_before_discount_paisa": number | null;
"applied_discount_paisa": number | null;
"primary_offer_claim_id": string | null;
"status": "committed" | "reversed";
"occurred_at": string;
"staff_user_id": string;
"idempotency_key": string;
"request_hash": string;
"corrects_purchase_id": string | null;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"branch_id": string;
"membership_id": string;
"programme_version_id": string;
"recorded_bill_paisa": number;
"eligible_spend_paisa": number;
"base_units": number;
"promotion_bonus_units"?: number;
"promotion_version_id"?: string | null;
"receipt_reference"?: string | null;
"qualifying_purchase_confirmed"?: boolean;
"qualifies_for_loyalty": boolean;
"offer_eligible_before_discount_paisa"?: number | null;
"applied_discount_paisa"?: number | null;
"primary_offer_claim_id"?: string | null;
"status"?: "committed" | "reversed";
"occurred_at"?: string;
"staff_user_id": string;
"idempotency_key": string;
"request_hash": string;
"corrects_purchase_id"?: string | null;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"branch_id"?: string;
"membership_id"?: string;
"programme_version_id"?: string;
"recorded_bill_paisa"?: number;
"eligible_spend_paisa"?: number;
"base_units"?: number;
"promotion_bonus_units"?: number;
"promotion_version_id"?: string | null;
"receipt_reference"?: string | null;
"qualifying_purchase_confirmed"?: boolean;
"qualifies_for_loyalty"?: boolean;
"offer_eligible_before_discount_paisa"?: number | null;
"applied_discount_paisa"?: number | null;
"primary_offer_claim_id"?: string | null;
"status"?: "committed" | "reversed";
"occurred_at"?: string;
"staff_user_id"?: string;
"idempotency_key"?: string;
"request_hash"?: string;
"corrects_purchase_id"?: string | null;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "purchases_business_id_branch_id_fkey"; columns: ["business_id","branch_id"]; referencedRelation: "branches"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "purchases_business_id_corrects_purchase_id_fkey"; columns: ["business_id","corrects_purchase_id"]; referencedRelation: "purchases"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "purchases_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "purchases_business_id_membership_id_fkey"; columns: ["business_id","membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "purchases_business_id_primary_offer_claim_id_fkey"; columns: ["business_id","primary_offer_claim_id"]; referencedRelation: "offer_claims"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "purchases_business_id_programme_version_id_fkey"; columns: ["business_id","programme_version_id"]; referencedRelation: "programme_versions"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "purchases_business_id_promotion_version_id_fkey"; columns: ["business_id","promotion_version_id"]; referencedRelation: "promotion_versions"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "purchases_staff_user_id_fkey"; columns: ["staff_user_id"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
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
"status": "pending" | "active" | "revoked" | "invalid";
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
"status"?: "pending" | "active" | "revoked" | "invalid";
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
"status"?: "pending" | "active" | "revoked" | "invalid";
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
"dispatch_state": "pending" | "sending" | "provider_accepted" | "failed" | "unknown";
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
"dispatch_state"?: "pending" | "sending" | "provider_accepted" | "failed" | "unknown";
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
"dispatch_state"?: "pending" | "sending" | "provider_accepted" | "failed" | "unknown";
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "push_registration_challenges_customer_user_id_fkey"; columns: ["customer_user_id"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false },
{ foreignKeyName: "push_registration_challenges_installation_id_fkey"; columns: ["installation_id"]; referencedRelation: "push_installations"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "push_registration_challenges_push_device_id_fkey"; columns: ["push_device_id"]; referencedRelation: "push_devices"; referencedColumns: ["id"]; isOneToOne: false }
];
};
"push_test_registrations": {
Row: {
"business_id": string;
"business_user_id": string;
"push_device_id": string;
"active": boolean;
"created_at": string;
};
Insert: {
"business_id": string;
"business_user_id": string;
"push_device_id": string;
"active"?: boolean;
"created_at"?: string;
};
Update: {
"business_id"?: string;
"business_user_id"?: string;
"push_device_id"?: string;
"active"?: boolean;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "push_test_registrations_business_id_business_user_id_fkey"; columns: ["business_id","business_user_id"]; referencedRelation: "business_users"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "push_test_registrations_push_device_id_fkey"; columns: ["push_device_id"]; referencedRelation: "push_devices"; referencedColumns: ["id"]; isOneToOne: false }
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
"redemption_intents": {
Row: {
"id": string;
"business_id": string;
"membership_id": string;
"reward_version_id": string;
"token_hash": string;
"expires_at": string;
"consumed_at": string | null;
"canceled_at": string | null;
"created_by": string;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"membership_id": string;
"reward_version_id": string;
"token_hash": string;
"expires_at": string;
"consumed_at"?: string | null;
"canceled_at"?: string | null;
"created_by": string;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"membership_id"?: string;
"reward_version_id"?: string;
"token_hash"?: string;
"expires_at"?: string;
"consumed_at"?: string | null;
"canceled_at"?: string | null;
"created_by"?: string;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "redemption_intents_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "redemption_intents_business_id_membership_id_fkey"; columns: ["business_id","membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "redemption_intents_business_id_reward_version_id_fkey"; columns: ["business_id","reward_version_id"]; referencedRelation: "reward_versions"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "redemption_intents_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"redemption_reversals": {
Row: {
"id": string;
"business_id": string;
"redemption_id": string;
"reason": string;
"actor_user_id": string;
"reversed_at": string;
"idempotency_key": string;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"redemption_id": string;
"reason": string;
"actor_user_id": string;
"reversed_at"?: string;
"idempotency_key": string;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"redemption_id"?: string;
"reason"?: string;
"actor_user_id"?: string;
"reversed_at"?: string;
"idempotency_key"?: string;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "redemption_reversals_actor_user_id_fkey"; columns: ["actor_user_id"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false },
{ foreignKeyName: "redemption_reversals_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "redemption_reversals_business_id_redemption_id_fkey"; columns: ["business_id","redemption_id"]; referencedRelation: "redemptions"; referencedColumns: ["business_id","id"]; isOneToOne: true }
];
};
"redemptions": {
Row: {
"id": string;
"business_id": string;
"membership_id": string;
"reward_version_id": string;
"intent_id": string;
"branch_id": string;
"unit_cost": number;
"estimated_cost_paisa": number | null;
"status": "fulfilled" | "reversed";
"fulfilled_at": string;
"fulfilled_by": string;
"purchase_id": string | null;
"idempotency_key": string;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"membership_id": string;
"reward_version_id": string;
"intent_id": string;
"branch_id": string;
"unit_cost": number;
"estimated_cost_paisa"?: number | null;
"status"?: "fulfilled" | "reversed";
"fulfilled_at"?: string;
"fulfilled_by": string;
"purchase_id"?: string | null;
"idempotency_key": string;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"membership_id"?: string;
"reward_version_id"?: string;
"intent_id"?: string;
"branch_id"?: string;
"unit_cost"?: number;
"estimated_cost_paisa"?: number | null;
"status"?: "fulfilled" | "reversed";
"fulfilled_at"?: string;
"fulfilled_by"?: string;
"purchase_id"?: string | null;
"idempotency_key"?: string;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "redemptions_business_id_branch_id_fkey"; columns: ["business_id","branch_id"]; referencedRelation: "branches"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "redemptions_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "redemptions_business_id_intent_id_fkey"; columns: ["business_id","intent_id"]; referencedRelation: "redemption_intents"; referencedColumns: ["business_id","id"]; isOneToOne: true },
{ foreignKeyName: "redemptions_business_id_membership_id_fkey"; columns: ["business_id","membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "redemptions_business_id_purchase_id_fkey"; columns: ["business_id","purchase_id"]; referencedRelation: "purchases"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "redemptions_business_id_reward_version_id_fkey"; columns: ["business_id","reward_version_id"]; referencedRelation: "reward_versions"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "redemptions_fulfilled_by_fkey"; columns: ["fulfilled_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"referral_cap_usage": {
Row: {
"id": string;
"business_id": string;
"referrer_membership_id": string;
"claim_id": string;
"local_month": string;
"reversed_at": string | null;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"referrer_membership_id": string;
"claim_id": string;
"local_month": string;
"reversed_at"?: string | null;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"referrer_membership_id"?: string;
"claim_id"?: string;
"local_month"?: string;
"reversed_at"?: string | null;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "referral_cap_usage_business_id_claim_id_fkey"; columns: ["business_id","claim_id"]; referencedRelation: "referral_claims"; referencedColumns: ["business_id","id"]; isOneToOne: true },
{ foreignKeyName: "referral_cap_usage_business_id_referrer_membership_id_fkey"; columns: ["business_id","referrer_membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: false }
];
};
"referral_claims": {
Row: {
"id": string;
"business_id": string;
"referrer_membership_id": string;
"referred_membership_id": string;
"code_id": string;
"rule_version_id": string;
"enrolled_at": string;
"qualifies_until": string;
"status": "pending" | "qualified" | "expired" | "reversed";
"qualifying_purchase_id": string | null;
"qualified_at": string | null;
"inviter_awarded_units": number;
"friend_awarded_units": number;
"inviter_suppression": "none" | "monthly_cap" | "member_unavailable";
"reversed_at": string | null;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"referrer_membership_id": string;
"referred_membership_id": string;
"code_id": string;
"rule_version_id": string;
"enrolled_at": string;
"qualifies_until": string;
"status"?: "pending" | "qualified" | "expired" | "reversed";
"qualifying_purchase_id"?: string | null;
"qualified_at"?: string | null;
"inviter_awarded_units"?: number;
"friend_awarded_units"?: number;
"inviter_suppression"?: "none" | "monthly_cap" | "member_unavailable";
"reversed_at"?: string | null;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"referrer_membership_id"?: string;
"referred_membership_id"?: string;
"code_id"?: string;
"rule_version_id"?: string;
"enrolled_at"?: string;
"qualifies_until"?: string;
"status"?: "pending" | "qualified" | "expired" | "reversed";
"qualifying_purchase_id"?: string | null;
"qualified_at"?: string | null;
"inviter_awarded_units"?: number;
"friend_awarded_units"?: number;
"inviter_suppression"?: "none" | "monthly_cap" | "member_unavailable";
"reversed_at"?: string | null;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "referral_claims_business_id_code_id_fkey"; columns: ["business_id","code_id"]; referencedRelation: "referral_codes"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "referral_claims_business_id_qualifying_purchase_id_fkey"; columns: ["business_id","qualifying_purchase_id"]; referencedRelation: "purchases"; referencedColumns: ["business_id","id"]; isOneToOne: true },
{ foreignKeyName: "referral_claims_business_id_referred_membership_id_fkey"; columns: ["business_id","referred_membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: true },
{ foreignKeyName: "referral_claims_business_id_referrer_membership_id_fkey"; columns: ["business_id","referrer_membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "referral_claims_business_id_rule_version_id_fkey"; columns: ["business_id","rule_version_id"]; referencedRelation: "referral_rule_versions"; referencedColumns: ["business_id","id"]; isOneToOne: false }
];
};
"referral_codes": {
Row: {
"id": string;
"business_id": string;
"membership_id": string;
"code": string;
"active": boolean;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"membership_id": string;
"code": string;
"active"?: boolean;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"membership_id"?: string;
"code"?: string;
"active"?: boolean;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "referral_codes_business_id_membership_id_fkey"; columns: ["business_id","membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: false }
];
};
"referral_rule_versions": {
Row: {
"id": string;
"business_id": string;
"version": number;
"effective_at": string;
"enabled": boolean;
"inviter_bonus_units": number;
"friend_bonus_units": number;
"minimum_spend_paisa": number;
"monthly_inviter_cap": number;
"attribution_days": number;
"qualification_days": number;
"created_by": string;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"version": number;
"effective_at": string;
"enabled"?: boolean;
"inviter_bonus_units": number;
"friend_bonus_units": number;
"minimum_spend_paisa": number;
"monthly_inviter_cap"?: number;
"attribution_days"?: number;
"qualification_days"?: number;
"created_by": string;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"version"?: number;
"effective_at"?: string;
"enabled"?: boolean;
"inviter_bonus_units"?: number;
"friend_bonus_units"?: number;
"minimum_spend_paisa"?: number;
"monthly_inviter_cap"?: number;
"attribution_days"?: number;
"qualification_days"?: number;
"created_by"?: string;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "referral_rule_versions_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "referral_rule_versions_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"referral_visit_events": {
Row: {
"id": string;
"business_id": string;
"referral_code_id": string;
"occurred_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"referral_code_id": string;
"occurred_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"referral_code_id"?: string;
"occurred_at"?: string;
};
Relationships: [
{ foreignKeyName: "referral_visit_events_business_id_referral_code_id_fkey"; columns: ["business_id","referral_code_id"]; referencedRelation: "referral_codes"; referencedColumns: ["business_id","id"]; isOneToOne: false }
];
};
"reward_branches": {
Row: {
"business_id": string;
"reward_version_id": string;
"branch_id": string;
"created_at": string;
};
Insert: {
"business_id": string;
"reward_version_id": string;
"branch_id": string;
"created_at"?: string;
};
Update: {
"business_id"?: string;
"reward_version_id"?: string;
"branch_id"?: string;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "reward_branches_business_id_branch_id_fkey"; columns: ["business_id","branch_id"]; referencedRelation: "branches"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "reward_branches_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "reward_branches_business_id_reward_version_id_fkey"; columns: ["business_id","reward_version_id"]; referencedRelation: "reward_versions"; referencedColumns: ["business_id","id"]; isOneToOne: false }
];
};
"reward_versions": {
Row: {
"id": string;
"business_id": string;
"reward_id": string;
"version": number;
"unit_cost": number;
"title": string;
"description": string;
"terms": string;
"estimated_cost_paisa": number | null;
"created_by": string;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"reward_id": string;
"version": number;
"unit_cost": number;
"title": string;
"description"?: string;
"terms": string;
"estimated_cost_paisa"?: number | null;
"created_by": string;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"reward_id"?: string;
"version"?: number;
"unit_cost"?: number;
"title"?: string;
"description"?: string;
"terms"?: string;
"estimated_cost_paisa"?: number | null;
"created_by"?: string;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "reward_versions_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "reward_versions_business_id_reward_id_fkey"; columns: ["business_id","reward_id"]; referencedRelation: "rewards"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "reward_versions_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"rewards": {
Row: {
"id": string;
"business_id": string;
"programme_id": string;
"name": string;
"status": "draft" | "published";
"published_version_id": string | null;
"draft_version_id": string | null;
"created_at": string;
"updated_at": string;
"row_version": number;
};
Insert: {
"id"?: string;
"business_id": string;
"programme_id": string;
"name": string;
"status"?: "draft" | "published";
"published_version_id"?: string | null;
"draft_version_id"?: string | null;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Update: {
"id"?: string;
"business_id"?: string;
"programme_id"?: string;
"name"?: string;
"status"?: "draft" | "published";
"published_version_id"?: string | null;
"draft_version_id"?: string | null;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Relationships: [
{ foreignKeyName: "rewards_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "rewards_business_id_id_draft_version_id_fkey"; columns: ["business_id","id","draft_version_id"]; referencedRelation: "reward_versions"; referencedColumns: ["business_id","reward_id","id"]; isOneToOne: true },
{ foreignKeyName: "rewards_business_id_id_published_version_id_fkey"; columns: ["business_id","id","published_version_id"]; referencedRelation: "reward_versions"; referencedColumns: ["business_id","reward_id","id"]; isOneToOne: true },
{ foreignKeyName: "rewards_business_id_programme_id_fkey"; columns: ["business_id","programme_id"]; referencedRelation: "loyalty_programmes"; referencedColumns: ["business_id","id"]; isOneToOne: false }
];
};
"scanner_codes": {
Row: {
"id": string;
"business_id": string;
"membership_id": string;
"code_hash": string;
"expires_at": string;
"consumed_at": string | null;
"purpose": "membership_lookup" | "redemption_lookup" | "offer_lookup";
"redemption_intent_id": string | null;
"offer_claim_intent_id": string | null;
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"membership_id": string;
"code_hash": string;
"expires_at": string;
"consumed_at"?: string | null;
"purpose": "membership_lookup" | "redemption_lookup" | "offer_lookup";
"redemption_intent_id"?: string | null;
"offer_claim_intent_id"?: string | null;
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"membership_id"?: string;
"code_hash"?: string;
"expires_at"?: string;
"consumed_at"?: string | null;
"purpose"?: "membership_lookup" | "redemption_lookup" | "offer_lookup";
"redemption_intent_id"?: string | null;
"offer_claim_intent_id"?: string | null;
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "scanner_codes_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "scanner_codes_business_id_membership_id_fkey"; columns: ["business_id","membership_id"]; referencedRelation: "memberships"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "scanner_codes_business_id_offer_claim_intent_id_fkey"; columns: ["business_id","offer_claim_intent_id"]; referencedRelation: "offer_claim_intents"; referencedColumns: ["business_id","id"]; isOneToOne: false },
{ foreignKeyName: "scanner_codes_business_id_redemption_intent_id_fkey"; columns: ["business_id","redemption_intent_id"]; referencedRelation: "redemption_intents"; referencedColumns: ["business_id","id"]; isOneToOne: false }
];
};
"staff_invitations": {
Row: {
"id": string;
"business_id": string;
"email": string;
"role": "manager" | "cashier";
"token_hash": string;
"expires_at": string;
"status": "pending" | "accepted" | "revoked" | "expired";
"invited_by": string;
"accepted_by": string | null;
"accepted_at": string | null;
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
"email": string;
"role": "manager" | "cashier";
"token_hash": string;
"expires_at": string;
"status"?: "pending" | "accepted" | "revoked" | "expired";
"invited_by": string;
"accepted_by"?: string | null;
"accepted_at"?: string | null;
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
"email"?: string;
"role"?: "manager" | "cashier";
"token_hash"?: string;
"expires_at"?: string;
"status"?: "pending" | "accepted" | "revoked" | "expired";
"invited_by"?: string;
"accepted_by"?: string | null;
"accepted_at"?: string | null;
"can_manage_campaigns"?: boolean;
"can_contact_customers"?: boolean;
"can_reverse_transactions"?: boolean;
"can_export_reports"?: boolean;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Relationships: [
{ foreignKeyName: "staff_invitations_accepted_by_fkey"; columns: ["accepted_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false },
{ foreignKeyName: "staff_invitations_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "staff_invitations_invited_by_fkey"; columns: ["invited_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
"subscriptions": {
Row: {
"id": string;
"business_id": string;
"plan_version_id": string;
"status": "trial" | "active" | "past_due" | "suspended" | "canceled";
"period_start": string;
"period_end": string;
"grace_ends_at": string | null;
"billing_anchor_at": string;
"canceled_at": string | null;
"cancel_at_period_end": boolean;
"created_at": string;
"updated_at": string;
"row_version": number;
"trial_ends_at": string | null;
"operator_suspended": boolean;
"cancellation_effective_at": string | null;
};
Insert: {
"id"?: string;
"business_id": string;
"plan_version_id": string;
"status": "trial" | "active" | "past_due" | "suspended" | "canceled";
"period_start": string;
"period_end": string;
"grace_ends_at"?: string | null;
"billing_anchor_at": string;
"canceled_at"?: string | null;
"cancel_at_period_end"?: boolean;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
"trial_ends_at"?: string | null;
"operator_suspended"?: boolean;
"cancellation_effective_at"?: string | null;
};
Update: {
"id"?: string;
"business_id"?: string;
"plan_version_id"?: string;
"status"?: "trial" | "active" | "past_due" | "suspended" | "canceled";
"period_start"?: string;
"period_end"?: string;
"grace_ends_at"?: string | null;
"billing_anchor_at"?: string;
"canceled_at"?: string | null;
"cancel_at_period_end"?: boolean;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
"trial_ends_at"?: string | null;
"operator_suspended"?: boolean;
"cancellation_effective_at"?: string | null;
};
Relationships: [
{ foreignKeyName: "subscriptions_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: true },
{ foreignKeyName: "subscriptions_plan_version_id_fkey"; columns: ["plan_version_id"]; referencedRelation: "plan_versions"; referencedColumns: ["id"]; isOneToOne: false }
];
};
"support_access_grants": {
Row: {
"id": string;
"business_id": string;
"admin_user_id": string;
"reason": string;
"starts_at": string;
"expires_at": string;
"revoked_at": string | null;
"scope": "configuration" | "transaction_support";
"created_at": string;
};
Insert: {
"id"?: string;
"business_id": string;
"admin_user_id": string;
"reason": string;
"starts_at"?: string;
"expires_at": string;
"revoked_at"?: string | null;
"scope": "configuration" | "transaction_support";
"created_at"?: string;
};
Update: {
"id"?: string;
"business_id"?: string;
"admin_user_id"?: string;
"reason"?: string;
"starts_at"?: string;
"expires_at"?: string;
"revoked_at"?: string | null;
"scope"?: "configuration" | "transaction_support";
"created_at"?: string;
};
Relationships: [
{ foreignKeyName: "support_access_grants_admin_user_id_fkey"; columns: ["admin_user_id"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false },
{ foreignKeyName: "support_access_grants_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false }
];
};
"whatsapp_templates": {
Row: {
"id": string;
"business_id": string;
"name": string;
"body": string;
"version": number;
"active": boolean;
"created_by": string;
"created_at": string;
"updated_at": string;
"row_version": number;
};
Insert: {
"id"?: string;
"business_id": string;
"name": string;
"body": string;
"version"?: number;
"active"?: boolean;
"created_by": string;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Update: {
"id"?: string;
"business_id"?: string;
"name"?: string;
"body"?: string;
"version"?: number;
"active"?: boolean;
"created_by"?: string;
"created_at"?: string;
"updated_at"?: string;
"row_version"?: number;
};
Relationships: [
{ foreignKeyName: "whatsapp_templates_business_id_fkey"; columns: ["business_id"]; referencedRelation: "businesses"; referencedColumns: ["id"]; isOneToOne: false },
{ foreignKeyName: "whatsapp_templates_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["user_id"]; isOneToOne: false }
];
};
}; Views: { [_ in never]: never }; Functions: {
"accept_staff_invitation": { Args: {"p_token": string;"p_correlation_id": string}; Returns: Json };
"account_export_access": { Args: {"p_artifact": string;"p_correlation": string}; Returns: Json };
"acknowledge_push_challenge": { Args: {"p_challenge_id": string;"p_installation_id": string;"p_nonce": string}; Returns: Json };
"act_on_followup_task": { Args: {"p_business": string;"p_task": string;"p_input": Json;"p_correlation": string}; Returns: Json };
"act_on_member_contact": { Args: {"p_business": string;"p_membership": string;"p_input": Json;"p_correlation": string}; Returns: Json };
"adjust_units": { Args: {"p_business": string;"p_membership": string;"p_units": number;"p_reason": string;"p_expected_version": number;"p_key": string;"p_correlation_id": string}; Returns: Json };
"admin_change_plan": { Args: {"p_business": string;"p_plan": string;"p_invoice": string;"p_reason": string;"p_correlation": string}; Returns: Json };
"admin_invoice_view": { Args: {"p_invoice": string}; Returns: Json };
"admin_job_action": { Args: {"p_event": string;"p_action": string;"p_reason": string;"p_correlation": string}; Returns: Json };
"admin_privacy_queue": { Args: {"p_page"?: number}; Returns: Json };
"admin_read": { Args: {"p_kind": string;"p_filters"?: Json}; Returns: Json };
"admin_retry_privacy": { Args: {"p_request": string;"p_reason": string;"p_correlation": string}; Returns: Json };
"admin_tenant_action": { Args: {"p_business": string;"p_action": string;"p_reason": string;"p_correlation": string}; Returns: Json };
"attach_brand_media": { Args: {"p_business_id": string;"p_asset_id": string;"p_row_version": number;"p_correlation_id": string}; Returns: Json };
"auth_send_email_hook": { Args: {"event": Json}; Returns: Json };
"automation_configuration": { Args: {"p_business": string}; Returns: Json };
"billing_view": { Args: {"p_business": string;"p_invoice"?: string}; Returns: Json };
"bootstrap_business": { Args: {"p_input": Json;"p_correlation_id": string}; Returns: Json };
"business_access": { Args: {"p_business_id": string;"p_branch_id": string}; Returns: Json };
"business_members": { Args: {"p_business_id": string;"p_branch_id"?: string;"p_offset"?: number}; Returns: Json };
"business_programmes": { Args: {"p_business": string}; Returns: Json };
"business_setup": { Args: {"p_business_id": string}; Returns: Json };
"campaign_configuration": { Args: {"p_business": string}; Returns: Json };
"campaign_test_devices": { Args: {"p_business": string}; Returns: Json };
"can_bootstrap_business": { Args: Record<string, never>; Returns: boolean };
"can_upload_media": { Args: {"p_path": string}; Returns: boolean };
"cancel_offer_intent": { Args: {"p_intent": string}; Returns: Json };
"cancel_redemption_intent": { Args: {"p_intent": string}; Returns: Json };
"cancel_subscription_renewal": { Args: {"p_business": string;"p_correlation": string}; Returns: Json };
"check_slug": { Args: {"p_slug": string}; Returns: boolean };
"claim_offer": { Args: {"p_offer": string;"p_correlation": string}; Returns: Json };
"complete_profile": { Args: {"p_display_name": string;"p_correlation_id": string}; Returns: Json };
"correct_payment": { Args: {"p_event": string;"p_reason": string;"p_key": string;"p_correlation": string}; Returns: Json };
"create_additional_programme": { Args: {"p_business": string;"p_input": Json;"p_correlation": string}; Returns: Json };
"create_followup_batch": { Args: {"p_business": string;"p_input": Json;"p_key": string;"p_correlation": string}; Returns: Json };
"create_offer_intent": { Args: {"p_claim": string;"p_token_hash": string;"p_correlation": string}; Returns: Json };
"create_redemption_intent": { Args: {"p_membership": string;"p_reward_version": string;"p_token_hash": string;"p_correlation_id": string}; Returns: Json };
"create_scanner_code": { Args: {"p_member": string;"p_purpose": string;"p_intent": string;"p_code_hash": string}; Returns: Json };
"create_staff_invitation": { Args: {"p_business_id": string;"p_input": Json;"p_correlation_id": string}; Returns: Json };
"customer_card": { Args: {"p_membership": string}; Returns: Json };
"customer_intent_status": { Args: {"p_intent": string}; Returns: Json };
"database_readiness": { Args: Record<string, never>; Returns: boolean };
"duplicate_campaign": { Args: {"p_business": string;"p_campaign": string;"p_correlation": string}; Returns: Json };
"duplicate_offer": { Args: {"p_business": string;"p_offer": string;"p_correlation": string}; Returns: Json };
"end_support_access": { Args: {"p_grant": string;"p_correlation": string}; Returns: Json };
"finalize_redemption": { Args: {"p_context_hash": string;"p_expected_hash": string;"p_key": string;"p_correlation_id": string}; Returns: Json };
"fulfill_offer": { Args: {"p_context_hash": string;"p_expected_hash": string;"p_key": string;"p_correlation": string}; Returns: Json };
"gateway_authorize_auth_email": { Args: {"p_email": string;"p_email_subject": string;"p_ip_subject": string;"p_callback_url": string}; Returns: Json };
"gateway_issue_referral_grant": { Args: {"p_auth_user": string;"p_session": string;"p_slug": string;"p_code": string;"p_seen_at": string;"p_token_hash": string}; Returns: boolean };
"gateway_limit_magic_link": { Args: {"p_email_subject": string;"p_ip_subject": string}; Returns: Json };
"gateway_record_referral_visit": { Args: {"p_code": string}; Returns: boolean };
"gateway_request_push_challenge": { Args: {"p_user": string;"p_session": string;"p_installation": string;"p_installation_secret_hash": string;"p_token_hash": string;"p_token_ciphertext": string;"p_key_id": string;"p_nonce_hash": string;"p_nonce_ciphertext": string}; Returns: Json };
"get_report": { Args: {"p_business": string;"p_filters"?: Json}; Returns: Json };
"get_value_result": { Args: {"p_business": string;"p_operation": string;"p_key": string}; Returns: Json };
"join_business": { Args: {"p_input": Json;"p_correlation_id": string}; Returns: Json };
"join_business_referral": { Args: {"p_input": Json;"p_grant_hash": string;"p_correlation_id": string}; Returns: Json };
"leave_membership": { Args: {"p_membership_id": string;"p_correlation_id": string}; Returns: Json };
"loyalty_configuration": { Args: {"p_business": string}; Returns: Json };
"manage_staff": { Args: {"p_business_id": string;"p_input": Json;"p_correlation_id": string}; Returns: Json };
"media_status": { Args: {"p_asset_id": string}; Returns: Json };
"membership_preferences": { Args: {"p_membership_id": string}; Returns: Json };
"my_admin_access": { Args: Record<string, never>; Returns: boolean };
"my_memberships": { Args: Record<string, never>; Returns: Json };
"my_offers": { Args: {"p_business"?: string}; Returns: Json };
"my_privacy_requests": { Args: Record<string, never>; Returns: Json };
"my_referral_code": { Args: {"p_member": string}; Returns: Json };
"my_workspaces": { Args: Record<string, never>; Returns: Json };
"observe_campaign_click": { Args: {"p_recipient": string}; Returns: Json };
"observe_notification_click": { Args: {"p_id": string}; Returns: Json };
"offer_configuration": { Args: {"p_business": string}; Returns: Json };
"offer_detail": { Args: {"p_offer": string}; Returns: Json };
"open_whatsapp_task": { Args: {"p_business": string;"p_task": string;"p_row_version": number;"p_correlation": string}; Returns: Json };
"operator_authorize_business": { Args: {"p_owner_id": string;"p_reason": string;"p_correlation_id": string}; Returns: Json };
"operator_transfer_owner": { Args: {"p_business_id": string;"p_current_owner": string;"p_replacement_owner": string;"p_reason": string;"p_correlation_id": string}; Returns: Json };
"owner_member_financial": { Args: {"p_business": string;"p_membership": string}; Returns: Json };
"payment_proof_access": { Args: {"p_asset": string;"p_correlation": string}; Returns: Json };
"preview_campaign_audience": { Args: {"p_business": string;"p_campaign": string}; Returns: Json };
"preview_followup_batch": { Args: {"p_business": string;"p_input": Json}; Returns: Json };
"preview_offer_fulfillment": { Args: {"p_context_hash": string}; Returns: Json };
"preview_programme_example": { Args: {"p_business": string;"p_mode": string;"p_minimum": number;"p_stamps": number;"p_step": number;"p_per_step": number;"p_cap": number;"p_eligible": number}; Returns: Json };
"preview_purchase": { Args: {"p_context_hash": string;"p_input": Json}; Returns: Json };
"preview_redemption": { Args: {"p_context_hash": string}; Returns: Json };
"programme_configuration": { Args: {"p_business": string;"p_programme": string}; Returns: Json };
"promotion_configuration": { Args: {"p_business": string}; Returns: Json };
"public_brand_media": { Args: {"p_slug": string}; Returns: Json };
"public_business": { Args: {"p_slug": string}; Returns: Json };
"public_configuration": { Args: Record<string, never>; Returns: Json };
"public_programme": { Args: {"p_slug": string;"p_programme": string}; Returns: Json };
"public_programmes": { Args: {"p_slug": string}; Returns: Json };
"publish_additional_programme": { Args: {"p_business": string;"p_programme": string;"p_correlation": string}; Returns: Json };
"publish_business": { Args: {"p_business_id": string;"p_row_version": number;"p_correlation_id": string}; Returns: Json };
"publish_programme_version": { Args: {"p_business": string;"p_version": string;"p_row_version": number;"p_correlation": string}; Returns: Json };
"publish_promotion": { Args: {"p_business": string;"p_promotion": string;"p_version": string;"p_row_version": number;"p_enable": boolean;"p_correlation": string}; Returns: Json };
"publish_reward": { Args: {"p_business": string;"p_reward": string;"p_row_version": number;"p_correlation": string}; Returns: Json };
"read_invitation": { Args: {"p_token": string}; Returns: Json };
"read_policy": { Args: {"p_id": string}; Returns: Json };
"reconcile_balances": { Args: {"p_business": string}; Returns: Json };
"reconcile_payment": { Args: {"p_invoice": string;"p_input": Json;"p_key": string;"p_correlation": string}; Returns: Json };
"record_purchase": { Args: {"p_context_hash": string;"p_input": Json;"p_correlation_id": string}; Returns: Json };
"referral_configuration": { Args: {"p_business": string;"p_start": string;"p_end": string;"p_status": string;"p_branch": string;"p_page": number;"p_size": number}; Returns: Json };
"report_configuration": { Args: {"p_business": string}; Returns: Json };
"report_export_status": { Args: {"p_business": string;"p_export": string;"p_download"?: boolean;"p_correlation"?: string}; Returns: Json };
"request_campaign_test": { Args: {"p_business": string;"p_campaign": string;"p_device": string}; Returns: Json };
"request_privacy": { Args: {"p_kind": string;"p_membership": string;"p_key": string;"p_correlation": string}; Returns: Json };
"request_report_export": { Args: {"p_business": string;"p_filters": Json;"p_columns": Json;"p_key": string;"p_correlation": string}; Returns: Json };
"resend_staff_invitation": { Args: {"p_business_id": string;"p_invitation_id": string;"p_row_version": number;"p_correlation_id": string}; Returns: Json };
"reserve_media": { Args: {"p_business_id": string;"p_kind": string;"p_mime_type": string;"p_bytes": number;"p_correlation_id": string}; Returns: Json };
"resolve_referral": { Args: {"p_code": string}; Returns: Json };
"resolve_scanner": { Args: {"p_business": string;"p_branch": string;"p_kind": string;"p_raw": string;"p_context_hash": string}; Returns: Json };
"resolve_scanner_for_programme": { Args: {"p_business": string;"p_branch": string;"p_kind": string;"p_raw": string;"p_context_hash": string;"p_programme": string}; Returns: Json };
"reverse_purchase": { Args: {"p_business": string;"p_purchase": string;"p_reason": string;"p_expected_version": number;"p_key": string;"p_correlation_id": string}; Returns: Json };
"reverse_redemption": { Args: {"p_business": string;"p_redemption": string;"p_reason": string;"p_expected_version": number;"p_key": string;"p_correlation_id": string}; Returns: Json };
"revoke_push_installation": { Args: {"p_installation_id": string}; Returns: Json };
"save_automation_rule": { Args: {"p_business": string;"p_input": Json;"p_correlation": string}; Returns: Json };
"save_branch": { Args: {"p_business_id": string;"p_input": Json;"p_correlation_id": string}; Returns: Json };
"save_business_settings": { Args: {"p_business_id": string;"p_input": Json;"p_correlation_id": string}; Returns: Json };
"save_campaign": { Args: {"p_business": string;"p_input": Json;"p_correlation": string}; Returns: Json };
"save_initial_programme": { Args: {"p_business_id": string;"p_input": Json;"p_correlation_id": string}; Returns: Json };
"save_membership_contact": { Args: {"p_membership_id": string;"p_input": Json;"p_correlation_id": string}; Returns: Json };
"save_offer": { Args: {"p_business": string;"p_input": Json;"p_correlation": string}; Returns: Json };
"save_plan_version": { Args: {"p_input": Json;"p_publish": boolean;"p_correlation": string}; Returns: Json };
"save_programme_version": { Args: {"p_business": string;"p_input": Json;"p_correlation": string}; Returns: Json };
"save_promotion": { Args: {"p_business": string;"p_input": Json;"p_correlation": string}; Returns: Json };
"save_referral_rules": { Args: {"p_business": string;"p_input": Json;"p_correlation": string}; Returns: Json };
"save_reward_draft": { Args: {"p_business": string;"p_input": Json;"p_correlation": string}; Returns: Json };
"save_whatsapp_template": { Args: {"p_business": string;"p_input": Json;"p_correlation": string}; Returns: Json };
"schedule_campaign": { Args: {"p_business": string;"p_campaign": string;"p_row_version": number;"p_scheduled_at": string;"p_key": string;"p_correlation": string}; Returns: Json };
"set_business_participation": { Args: {"p_business_id": string;"p_status": string;"p_row_version": number;"p_correlation_id": string}; Returns: Json };
"set_campaign_status": { Args: {"p_business": string;"p_campaign": string;"p_action": string;"p_row_version": number;"p_correlation": string}; Returns: Json };
"set_campaign_test_device": { Args: {"p_business": string;"p_installation": string;"p_generation": string;"p_enabled": boolean}; Returns: Json };
"set_consent": { Args: {"p_membership_id": string;"p_channel": string;"p_purpose": string;"p_allowed": boolean;"p_text_version": string;"p_correlation_id": string}; Returns: Json };
"set_membership_handle": { Args: {"p_member": string;"p_hash": string;"p_ciphertext": string;"p_key_id": string;"p_rotate": boolean;"p_correlation_id": string}; Returns: Json };
"set_offer_status": { Args: {"p_business": string;"p_offer": string;"p_status": string;"p_row_version": number;"p_correlation": string}; Returns: Json };
"set_programme_status": { Args: {"p_business": string;"p_status": string;"p_row_version": number;"p_correlation": string}; Returns: Json };
"set_programme_status_for": { Args: {"p_business": string;"p_programme": string;"p_status": string;"p_row_version": number;"p_correlation": string}; Returns: Json };
"set_promotion_status": { Args: {"p_business": string;"p_promotion": string;"p_status": string;"p_row_version": number;"p_correlation": string}; Returns: Json };
"staff_activity": { Args: {"p_business": string;"p_branch": string;"p_type": string;"p_start": string;"p_end": string;"p_size": number;"p_page": number}; Returns: Json };
"staff_activity_detail": { Args: {"p_business": string;"p_type": string;"p_id": string}; Returns: Json };
"staff_context": { Args: {"p_business": string}; Returns: Json };
"staff_programmes": { Args: {"p_business": string}; Returns: Json };
"start_support_access": { Args: {"p_business": string;"p_reason": string;"p_scope": string;"p_minutes": number;"p_correlation": string}; Returns: Json };
"submit_media": { Args: {"p_asset_id": string;"p_correlation_id": string}; Returns: Json };
"submit_payment_evidence": { Args: {"p_business": string;"p_invoice": string;"p_input": Json;"p_key": string;"p_correlation": string}; Returns: Json };
"support_read": { Args: {"p_grant": string;"p_correlation": string}; Returns: Json };
"update_platform_setting": { Args: {"p_key": string;"p_value": Json;"p_reason": string;"p_correlation": string}; Returns: Json };
"update_profile": { Args: {"p_input": Json;"p_correlation_id": string}; Returns: Json };
"whatsapp_configuration": { Args: {"p_business": string}; Returns: Json };
"whatsapp_member_contact": { Args: {"p_business": string;"p_membership": string}; Returns: Json };
"whatsapp_members": { Args: {"p_business": string;"p_query"?: string;"p_offset"?: number}; Returns: Json };
"whatsapp_task_detail": { Args: {"p_business": string;"p_task": string}; Returns: Json };
"whatsapp_tasks": { Args: {"p_business": string;"p_filters"?: Json}; Returns: Json };
"worker_account_artifact": { Args: {"p_request": string;"p_token": string;"p_part": number;"p_path": string;"p_bytes": number;"p_ciphertext": string;"p_key_id": string}; Returns: string };
"worker_account_export_page": { Args: {"p_request": string;"p_token": string;"p_section": string;"p_cursor"?: string}; Returns: Json };
"worker_auth_email_job": { Args: {"p_outbox_id": string}; Returns: Json };
"worker_automation_attempt_ready": { Args: {"p_attempt": string}; Returns: Json };
"worker_billing_cycle": { Args: Record<string, never>; Returns: Json };
"worker_campaign_attempt_ready": { Args: {"p_attempt": string}; Returns: Json };
"worker_campaign_test_ready": { Args: {"p_request": string}; Returns: boolean };
"worker_claim_automation_delivery": { Args: Record<string, never>; Returns: Json };
"worker_claim_campaign_delivery": { Args: Record<string, never>; Returns: Json };
"worker_claim_campaign_test": { Args: {"p_outbox": string}; Returns: Json };
"worker_claim_push_challenge": { Args: {"p_outbox_id": string}; Returns: Json };
"worker_expire_pending_automation_attempts": { Args: Record<string, never>; Returns: number };
"worker_expire_pending_campaign_attempts": { Args: Record<string, never>; Returns: number };
"worker_expire_push_challenges": { Args: Record<string, never>; Returns: number };
"worker_expired_media": { Args: Record<string, never>; Returns: Json };
"worker_expired_report_exports": { Args: Record<string, never>; Returns: Json };
"worker_fail_report_export": { Args: {"p_outbox": string}; Returns: undefined };
"worker_finish_auth_email": { Args: {"p_outbox_id": string;"p_provider_id": string}; Returns: undefined };
"worker_finish_automation_attempt": { Args: {"p_attempt": string;"p_state": string;"p_provider_id": string;"p_error_code": string}; Returns: undefined };
"worker_finish_campaign_attempt": { Args: {"p_attempt": string;"p_state": string;"p_provider_id": string;"p_error_code": string}; Returns: undefined };
"worker_finish_campaign_test": { Args: {"p_request": string;"p_state": string;"p_message": string;"p_error": string}; Returns: boolean };
"worker_finish_campaigns": { Args: Record<string, never>; Returns: number };
"worker_finish_media": { Args: {"p_outbox_id": string;"p_accepted": boolean;"p_bytes": number;"p_width": number;"p_height": number}; Returns: undefined };
"worker_finish_privacy": { Args: {"p_request": string;"p_token": string;"p_error"?: string}; Returns: boolean };
"worker_finish_push_challenge": { Args: {"p_challenge_id": string;"p_state": string}; Returns: undefined };
"worker_finish_report_export": { Args: {"p_export": string;"p_token": string;"p_bytes": number;"p_ciphertext": string;"p_key_id": string;"p_error"?: string}; Returns: boolean };
"worker_health_status": { Args: Record<string, never>; Returns: Json };
"worker_heartbeat": { Args: Record<string, never>; Returns: undefined };
"worker_mark_dispatched": { Args: {"p_id": string}; Returns: undefined };
"worker_mark_media_purged": { Args: {"p_asset_id": string}; Returns: undefined };
"worker_media_job": { Args: {"p_outbox_id": string}; Returns: Json };
"worker_observe_loyalty": { Args: {"p_outbox": string}; Returns: boolean };
"worker_observe_profile": { Args: {"p_outbox_id": string}; Returns: boolean };
"worker_pending_outbox": { Args: Record<string, never>; Returns: Json[] };
"worker_privacy_database": { Args: {"p_request": string;"p_token": string}; Returns: Json };
"worker_privacy_job": { Args: {"p_outbox": string}; Returns: Json };
"worker_purge_auth_email": { Args: Record<string, never>; Returns: undefined };
"worker_purge_manual_messages": { Args: Record<string, never>; Returns: number };
"worker_purge_rate_limits": { Args: Record<string, never>; Returns: number };
"worker_purge_referral_grants": { Args: Record<string, never>; Returns: number };
"worker_purge_referral_visits": { Args: Record<string, never>; Returns: number };
"worker_purge_report_export": { Args: {"p_export": string;"p_path": string}; Returns: undefined };
"worker_reconcile_balances": { Args: Record<string, never>; Returns: Json };
"worker_report_export": { Args: {"p_outbox": string}; Returns: Json };
"worker_reserve_account_upload": { Args: {"p_request": string;"p_token": string;"p_path": string}; Returns: undefined };
"worker_retention": { Args: Record<string, never>; Returns: Json };
"worker_scan_automations": { Args: Record<string, never>; Returns: Json };
"worker_scan_campaigns": { Args: Record<string, never>; Returns: Json };
"worker_vercel_activate": { Args: {"p_generation": string;"p_deployment": string;"p_run": string}; Returns: undefined };
"worker_vercel_advance": { Args: {"p_generation": string;"p_epoch": number;"p_previous": string;"p_next": string}; Returns: boolean };
"worker_vercel_current": { Args: {"p_generation": string;"p_deployment": string;"p_epoch": number;"p_run": string}; Returns: boolean };
"worker_vercel_disable": { Args: Record<string, never>; Returns: undefined };
"worker_vercel_status": { Args: Record<string, never>; Returns: Json };
}; Enums: { [_ in never]: never }; CompositeTypes: { [_ in never]: never }; } };
