'use client';

import { FormEvent, ReactNode, useEffect, useId, useRef, useState, useTransition } from 'react';

export type InlineCheckoutResult = {
  ok: boolean;
  error?: string;
  clientSecret?: string;
  status?: string;
  totalNok?: number;
  referenceId?: string;
  returnUrl?: string;
};

interface StripeErrorLike { message?: string }
interface StripePaymentIntentLike { status?: string }
interface StripePaymentElement { mount: (selector: string) => void; destroy?: () => void }
interface StripeElementsGroup {
  create: (type: 'payment', options?: Record<string, unknown>) => StripePaymentElement;
  submit: () => Promise<{ error?: StripeErrorLike }>;
}
interface StripeBrowserClient {
  elements: (options: Record<string, unknown>) => StripeElementsGroup;
  createConfirmationToken: (options: { elements: StripeElementsGroup }) => Promise<{ error?: StripeErrorLike; confirmationToken?: { id: string } }>;
  handleNextAction: (options: { clientSecret: string }) => Promise<{ error?: StripeErrorLike; paymentIntent?: StripePaymentIntentLike }>;
}

declare global {
  interface Window {
    Stripe?: (publishableKey: string) => StripeBrowserClient;
  }
}

let stripeScriptPromise: Promise<void> | null = null;
function loadStripeJs() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.Stripe) return Promise.resolve();
  if (stripeScriptPromise) return stripeScriptPromise;
  stripeScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://js.stripe.com/v3/"]');
    if (existing) {
      if (window.Stripe) return resolve();
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Kunne ikke laste kortbetalingen.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Kunne ikke laste kortbetalingen.'));
    document.head.appendChild(script);
  });
  return stripeScriptPromise;
}

export function InlinePaymentForm({
  action,
  publishableKey,
  amountNok,
  children,
  buttonLabel,
  className = '',
  footer,
  captureMethod = 'automatic',
}: {
  action: (formData: FormData) => Promise<InlineCheckoutResult>;
  publishableKey: string;
  amountNok: number;
  children: ReactNode;
  buttonLabel?: string;
  className?: string;
  footer?: ReactNode;
  captureMethod?: 'automatic' | 'manual';
}) {
  const rawId = useId();
  const elementId = `hundetimer-payment-${rawId.replace(/:/g, '')}`;
  const stripeRef = useRef<StripeBrowserClient | null>(null);
  const elementsRef = useRef<StripeElementsGroup | null>(null);
  const paymentElementRef = useRef<StripePaymentElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    setReady(false);
    setError('');

    void (async () => {
      try {
        if (!publishableKey) throw new Error('Stripe publishable key mangler.');
        await loadStripeJs();
        if (!active || !window.Stripe) return;
        const stripe = window.Stripe(publishableKey);
        stripeRef.current = stripe;
        const elements = stripe.elements({
          mode: 'payment',
          amount: Math.round(amountNok * 100),
          currency: 'nok',
          paymentMethodCreation: 'manual',
          paymentMethodTypes: ['card'],
          captureMethod,
          appearance: {
            theme: 'stripe',
            variables: {
              borderRadius: '10px',
              fontFamily: 'inherit',
            },
          },
        });
        elementsRef.current = elements;
        const paymentElement = elements.create('payment', { layout: 'tabs' });
        paymentElementRef.current = paymentElement;
        paymentElement.mount(`#${elementId}`);
        if (active) setReady(true);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Kunne ikke laste kortbetalingen.');
      }
    })();

    return () => {
      active = false;
      try { paymentElementRef.current?.destroy?.(); } catch { /* Stripe also removes its iframe on unmount. */ }
      paymentElementRef.current = null;
      elementsRef.current = null;
      stripeRef.current = null;
    };
  }, [amountNok, captureMethod, elementId, publishableKey]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    const form = event.currentTarget;
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements || !ready) {
      setError('Kortbetalingen er ikke klar ennå. Prøv igjen om et øyeblikk.');
      return;
    }

    setError('');
    const formData = new FormData(form);

    startTransition(async () => {
      try {
        const submitted = await elements.submit();
        if (submitted.error) throw new Error(submitted.error.message || 'Kontroller kortopplysningene.');

        const tokenResult = await stripe.createConfirmationToken({ elements });
        if (tokenResult.error || !tokenResult.confirmationToken) {
          throw new Error(tokenResult.error?.message || 'Kunne ikke klargjøre betalingen.');
        }

        formData.set('confirmationTokenId', tokenResult.confirmationToken.id);
        const result = await action(formData);
        if (!result.ok) throw new Error(result.error || 'Betalingen kunne ikke fullføres.');

        if (result.status === 'requires_action') {
          if (!result.clientSecret) throw new Error('Betalingen krever bekreftelse, men mangler betalingsnøkkel.');
          const next = await stripe.handleNextAction({ clientSecret: result.clientSecret });
          if (next.error) throw new Error(next.error.message || 'Bankbekreftelsen kunne ikke fullføres.');
        }

        if (result.returnUrl) {
          window.location.assign(result.returnUrl);
          return;
        }
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Betalingen kunne ikke fullføres.');
      }
    });
  }

  return <form className={className} onSubmit={submit}>
    <fieldset className="inline-payment-fields" disabled={isPending}>
      {children}
    </fieldset>

    <div className="inline-payment-visible">
      <div className="inline-payment-heading">
        <span className="eyebrow">Sikker kortbetaling</span>
        <h3>Betal med kort</h3>
      </div>
      <div id={elementId} className="embedded-payment-element" aria-busy={!ready} />
      {!ready && !error ? <p className="muted small">Laster sikker kortbetaling ...</p> : null}
      {error ? <p className="form-error form-error-block" role="alert">{error}</p> : null}
      <button className="btn wide embedded-pay-button" type="submit" disabled={!ready || isPending}>
        {isPending ? 'Behandler betaling ...' : (buttonLabel || `Betal ${new Intl.NumberFormat('nb-NO').format(amountNok)} kr`)}
      </button>
      {footer}
      <p className="embedded-payment-security">🔒 Kortopplysningene sendes direkte til Stripe og lagres ikke av Hundetimer.</p>
    </div>
  </form>;
}
