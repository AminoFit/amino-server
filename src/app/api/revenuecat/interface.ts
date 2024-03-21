interface RevenueCatWebhookEvent {
	api_version: string;
	event: {
	  aliases: string[];
	  app_id: string;
	  app_user_id: string;
	  commission_percentage: number | null;
	  country_code: string | null;
	  currency: string | null;
	  entitlement_id: string | null; // Deprecated
	  entitlement_ids: string[] | null;
	  environment: 'SANDBOX' | 'PRODUCTION';
	  event_timestamp_ms: number;
	  expiration_at_ms: number | null;
	  id: string;
	  is_family_share: boolean;
	  offer_code: string | null;
	  original_app_user_id: string;
	  original_transaction_id: string;
	  period_type: 'TRIAL' | 'INTRO' | 'NORMAL' | 'PROMOTIONAL' | 'PREPAID';
	  presented_offering_id: string | null;
	  price: number | null;
	  price_in_purchased_currency: number | null;
	  product_id: string;
	  purchased_at_ms: number;
	  store: 'AMAZON' | 'APP_STORE' | 'MAC_APP_STORE' | 'PLAY_STORE' | 'PROMOTIONAL' | 'STRIPE';
	  subscriber_attributes: {
		[key: string]: {
		  updated_at_ms: number;
		  value: string;
		};
	  };
	  takehome_percentage: number | null;
	  tax_percentage: number | null;
	  transaction_id: string;
	  type:
		| 'TEST'
		| 'INITIAL_PURCHASE'
		| 'NON_RENEWING_PURCHASE'
		| 'RENEWAL'
		| 'PRODUCT_CHANGE'
		| 'CANCELLATION'
		| 'UNCANCELLATION'
		| 'BILLING_ISSUE'
		| 'SUBSCRIPTION_PAUSED'
		| 'EXPIRATION'
		| 'TRANSFER'
		| 'SUBSCRIPTION_EXTENDED'
		| 'TEMPORARY_ENTITLEMENT_GRANT';
	  grace_period_expiration_at_ms?: number | null; // Only for BILLING_ISSUE events
	  is_trial_conversion?: boolean; // Only for RENEWAL events
	  cancel_reason?:
		| 'UNSUBSCRIBE'
		| 'BILLING_ERROR'
		| 'DEVELOPER_INITIATED'
		| 'PRICE_INCREASE'
		| 'CUSTOMER_SUPPORT'
		| 'UNKNOWN'; // Only for CANCELLATION events
	  expiration_reason?:
		| 'UNSUBSCRIBE'
		| 'BILLING_ERROR'
		| 'DEVELOPER_INITIATED'
		| 'PRICE_INCREASE'
		| 'CUSTOMER_SUPPORT'
		| 'UNKNOWN'
		| 'SUBSCRIPTION_PAUSED'; // Only for EXPIRATION events
	  new_product_id?: string; // Only for PRODUCT_CHANGE events
	  auto_resume_at_ms?: number; // Only for SUBSCRIPTION_PAUSED events
	  transferred_from?: string[]; // Only for TRANSFER events
	  transferred_to?: string[]; // Only for TRANSFER events
	};
  }