// Seed data for KnowledgeBaseEntry, read once by prisma/seed.ts.
//
// This is the retrieval source for Path A (AI auto-resolve) — see
// lib/knowledge-base.ts and lib/ai-auto-resolve.ts. Per project-scope.md,
// it's a small, manually curated FAQ/policy set, not sourced from real
// ticket history.
//
// `title` is @unique in schema.prisma, so seed.ts upserts by title. Edit
// an entry's content here and re-run `npm run db:seed` to update it.
export type KnowledgeBaseEntrySeed = {
  title: string;
  content: string;
  category: string;
};

export const kbEntries: KnowledgeBaseEntrySeed[] = [
  {
    title: "Refund policy",
    content:
      "Customers can request a full refund within 30 days of purchase, no reason required. " +
      "Refunds are issued to the original payment method and typically appear within 5-7 " +
      "business days. After 30 days, refunds are only issued for defective or " +
      "not-as-described items, and require the order number.",
    category: "billing",
  },
  {
    title: "How to request a refund",
    content:
      "To request a refund, reply with your order number and the reason for the return. " +
      "No physical return is required for digital or subscription products. For physical " +
      "goods, a prepaid return label is emailed once the request is approved.",
    category: "billing",
  },
  {
    title: "Password reset",
    content:
      "Customers can reset their password from the login page by clicking 'Forgot password' " +
      "and entering their account email. A reset link is emailed immediately and expires " +
      "after 1 hour. If the email doesn't arrive within a few minutes, check spam, then " +
      "confirm the email on file matches the account.",
    category: "account",
  },
  {
    title: "Account locked after failed logins",
    content:
      "An account locks for 15 minutes after 5 consecutive failed login attempts, as a " +
      "brute-force protection measure. There's no manual unlock — customers just need to " +
      "wait out the 15 minutes, or use the password reset flow, which does not count " +
      "against the failed-attempt limit.",
    category: "account",
  },
  {
    title: "Shipping timelines",
    content:
      "Standard shipping takes 5-7 business days within the country of origin, and " +
      "10-15 business days internationally. Expedited shipping (2-3 business days) is " +
      "available at checkout for an extra fee. Delays beyond these windows should be " +
      "escalated with the order number and shipping address.",
    category: "shipping",
  },
  {
    title: "Tracking a shipped order",
    content:
      "A tracking number is emailed automatically once an order ships, usually within " +
      "1 business day of purchase. If a customer hasn't received a shipping confirmation " +
      "after 2 business days, check the order status directly rather than assuming it's lost.",
    category: "shipping",
  },
  {
    title: "Order not received",
    content:
      "If tracking shows delivered but the customer says they haven't received the package, " +
      "ask them to check with neighbors and the building's front desk first, since carriers " +
      "sometimes mark packages delivered a day early. If it's genuinely missing after 48 " +
      "hours, this needs a human agent to file a carrier claim — not something to resolve " +
      "with a policy answer alone.",
    category: "shipping",
  },
  {
    title: "Canceling a subscription",
    content:
      "Subscriptions can be canceled anytime from Account Settings > Subscription > Cancel. " +
      "Cancellation takes effect at the end of the current billing period — access continues " +
      "until then, and there's no partial-period refund for canceling early. There's no fee " +
      "to cancel.",
    category: "billing",
  },
  {
    title: "Subscription renewed after cancellation",
    content:
      "This happens when a cancellation was submitted after the billing cycle had already " +
      "renewed, or when a customer has more than one active subscription/payment method on " +
      "file. Refunding an unwanted renewal is fine to do directly (see refund policy) — but " +
      "confirming which subscription actually renewed needs a look at the account, not a " +
      "canned answer.",
    category: "billing",
  },
  {
    title: "Updating billing address",
    content:
      "Billing address can be changed from Account Settings > Payment Methods > Edit. " +
      "This only affects future invoices, it does not change history on past orders or " +
      "receipts, which are locked at the time of purchase.",
    category: "billing",
  },
  {
    title: "Invoice shows an unexpected amount",
    content:
      "Common causes: a prorated charge from a mid-cycle plan upgrade, a currency-conversion " +
      "difference from the bank, or a previously failed payment retried automatically. A " +
      "specific invoice discrepancy needs someone to pull up the actual billing record — " +
      "this is a starting point for the agent, not something to answer from policy alone.",
    category: "billing",
  },
  {
    title: "Changing account email",
    content:
      "Account email can be changed from Account Settings > Profile > Email. A verification " +
      "link is sent to the new address, and the change only takes effect once that link is " +
      "clicked, so access to the old inbox is required to complete it.",
    category: "account",
  },
  {
    title: "Deleting an account",
    content:
      "Account deletion is permanent and removes all order history and saved data after a " +
      "30-day grace period, during which logging back in cancels the deletion. Deletion " +
      "requests must come from the account's own registered email, not a third party.",
    category: "account",
  },
  {
    title: "Payment declined at checkout",
    content:
      "Most declines come from the card issuer, not from us — common causes are insufficient " +
      "funds, an expired card, or the issuer's own fraud check. Ask the customer to confirm " +
      "the card details and try again, or use a different payment method. Repeated declines " +
      "on a card the customer insists is valid should go to an agent to check for something " +
      "on our end blocking it.",
    category: "billing",
  },
  {
    title: "App crashes on checkout",
    content:
      "This is a product/technical bug report, not a policy question — it needs an agent to " +
      "gather device, OS, and app version details and either reproduce it or escalate to " +
      "engineering. Not something to answer with a canned response.",
    category: "technical",
  },
];
