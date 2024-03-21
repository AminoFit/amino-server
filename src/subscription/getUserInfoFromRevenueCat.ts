//src/subscription/getUserInfoFromRevenueCat.ts
interface CustomerInfo {
	request_date: string;
	request_date_ms: number;
	subscriber: {
	  entitlements: {
		[key: string]: {
		  expires_date: string | null;
		  grace_period_expires_date: string | null;
		  product_identifier: string;
		  purchase_date: string;
		} | undefined;
	  };
	  first_seen: string;
	  management_url: string;
	  non_subscriptions: {
		[key: string]: {
		  id: string;
		  is_sandbox: boolean;
		  purchase_date: string;
		  store: string;
		}[];
	  };
	  original_app_user_id: string;
	  original_application_version: string;
	  original_purchase_date: string;
	  other_purchases: {};
	  subscriptions: {
		[key: string]: {
		  auto_resume_date: string | null;
		  billing_issues_detected_at: string | null;
		  expires_date: string;
		  grace_period_expires_date: string | null;
		  is_sandbox: boolean;
		  original_purchase_date: string;
		  ownership_type: 'PURCHASED' | 'FAMILY_SHARED';
		  period_type: 'normal' | 'trial' | 'intro';
		  purchase_date: string;
		  refunded_at: string | null;
		  store: string;
		  unsubscribe_detected_at: string | null;
		} | undefined;
	  };
	};
  }

  const DEBUG = true; // Set to false to disable sandbox events and less verbose output
  
  export async function getSubscriptionFromRevenueCat(userId: string): Promise<CustomerInfo> {
	try {
	  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${userId}`, {
		headers: {
		  'Authorization': `Bearer ${process.env.REVENUECAT_SECRET_API_KEY}`,
		  'Content-Type': 'application/json',
		  'X-Is-Sandbox': true ? 'true' : 'false',
		}
	  });
  
	  if (!response.ok) {
		throw new Error(`Failed to fetch customer info: ${response.status}`);
	  }
  
	  const customerInfo: CustomerInfo = await response.json();
  
	  return customerInfo;
	} catch (error) {
	  console.error('Error fetching customer info:', error);
	  throw error;
	}
  }