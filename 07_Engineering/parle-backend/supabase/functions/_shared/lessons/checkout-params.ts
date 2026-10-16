export type CheckoutInput = { bookingId: string; amountCents: number; description: string; customerEmail: string; expiresAt: number; successUrl: string; cancelUrl: string };

/**
 * The Stripe Checkout page for one lesson, charged in CAD (decision #55). Cards only: a method that settles days later (bank debits) would complete
 * after the 30-minute hold ended, and the lesson would be paid with no time held (final review).
 */
export function checkoutSessionParams(i: CheckoutInput) {
  return {
    mode: "payment" as const,
    payment_method_types: ["card"],
    customer_email: i.customerEmail,
    line_items: [{ price_data: { currency: "cad", unit_amount: i.amountCents, product_data: { name: i.description } }, quantity: 1 }],
    metadata: { kind: "lesson", booking_id: i.bookingId },
    payment_intent_data: { metadata: { kind: "lesson", booking_id: i.bookingId } },
    expires_at: i.expiresAt,
    success_url: i.successUrl,
    cancel_url: i.cancelUrl,
  };
}
