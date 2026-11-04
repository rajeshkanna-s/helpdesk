import { useEffect, useState } from 'react';
import { ArrowLeft, LifeBuoy } from 'lucide-react';
import { apiService } from '../services/api';
import type { PublicPlan } from '../services/api';
import './onboarding.css';

interface PricingPageProps {
  onBack: () => void;
  onSelectPlan: (planTier: string, billingCycle: 'monthly' | 'annual') => void;
  onNavigateToLogin: () => void;
}

const money = (amount: number, currency: PublicPlan['currency']) => new Intl.NumberFormat('en-IN', { style: 'currency', currency, currencyDisplay: 'code', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
const featureLabel = (key: string) => ({ api: 'API', sla: 'SLA', csat: 'CSAT' } as Record<string, string>)[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, letter => letter.toUpperCase());
const featureValue = (value: boolean | undefined) => value === true ? 'Listed' : value === false ? 'Not listed' : 'Not specified';
function storageSize(bytes: number) {
  const divisor = bytes >= 1024 ** 3 ? 1024 ** 3 : bytes >= 1024 ** 2 ? 1024 ** 2 : 1;
  return `${(bytes / divisor).toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${divisor === 1 ? 'bytes' : divisor === 1024 ** 2 ? 'MiB' : 'GiB'}`;
}

export function PricingPage({ onBack, onSelectPlan, onNavigateToLogin }: PricingPageProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const features = [...new Set(plans.flatMap(plan => Object.keys(plan.features)))].sort();

  useEffect(() => {
    let current = true;
    setLoading(true); setError('');
    apiService.getPublicPlans().then(catalog => {
      if (current) setPlans(catalog.filter(plan => plan.status === 'PUBLIC' && plan.currency === 'INR' && plan.gstExclusive));
    }).catch(() => { if (current) { setPlans([]); setError('Current plans could not be loaded. Please try again.'); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [reload]);

  return <div className="pricing-page onboarding-ui">
    <header className="pricing-header"><div className="pricing-container pricing-navigation">
      <div className="onboarding-brand"><LifeBuoy size={26} aria-hidden="true" /><span>Kuwy HelpDesk</span></div>
      <button type="button" className="onboarding-button" onClick={onNavigateToLogin}>Sign in</button>
    </div></header>
    <main>
      <section className="pricing-hero"><div className="pricing-container">
        <button type="button" className="onboarding-button pricing-back" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />Back</button>
        <p className="onboarding-eyebrow">PLANS &amp; PRICING</p><h1>The right fit for your support team.</h1>
        <p>Compare the current plans, included capacity, and billing options.</p>
        <div className="pricing-cycle" role="group" aria-label="Billing cycle">
          <button type="button" aria-pressed={billingCycle === 'monthly'} onClick={() => setBillingCycle('monthly')}>Monthly</button>
          <button type="button" aria-pressed={billingCycle === 'annual'} onClick={() => setBillingCycle('annual')}>Annual</button>
        </div>
        <p className="pricing-tax">Prices in INR. GST extra. Annual totals are shown in full.</p>
      </div></section>
      <div className="pricing-container pricing-body">
        {loading ? <div className="pricing-state" role="status"><span className="onboarding-spinner" aria-hidden="true" />Loading current plans...</div>
          : error || !plans.length ? <div className="pricing-state"><p role={error ? 'alert' : 'status'}>{error || 'No public plans are currently available.'}</p><button className="onboarding-button" type="button" onClick={() => setReload(value => value + 1)}>Retry plans</button></div>
            : <>
              <section className="pricing-plans" aria-label="Available plans">
                {plans.map(plan => <article key={plan.code} className={`pricing-card${plan.code === 'PRO' ? ' pricing-recommended' : ''}`} data-plan-code={plan.code} data-plan-revision={plan.revision}>
                  <div className="pricing-card-heading"><h2>{plan.displayName}</h2>{plan.code === 'PRO' && <span className="pricing-badge">Recommended</span>}</div>
                  <p className="pricing-description">{plan.description}</p>
                  <div className="pricing-price"><strong>{money(billingCycle === 'annual' ? plan.yearlyPrice / 12 : plan.monthlyPrice, plan.currency)}</strong><span> / month{billingCycle === 'annual' ? ' equivalent' : ''}</span></div>
                  <p className="pricing-charge">{money(billingCycle === 'annual' ? plan.yearlyPrice : plan.monthlyPrice, plan.currency)} billed {billingCycle === 'annual' ? 'annually' : 'monthly'}. GST extra.</p>
                  <dl className="pricing-limits">
                    <div><dt>Included agents</dt><dd>{plan.includedAgents.toLocaleString('en-IN')}</dd></div>
                    <div><dt>Tickets / month</dt><dd>{plan.ticketLimitMonthly.toLocaleString('en-IN')}</dd></div>
                    <div><dt>Storage</dt><dd>{storageSize(plan.storageBytes)}</dd></div>
                    <div><dt>Trial</dt><dd>{plan.trialDays > 0 ? `${plan.trialDays} days` : 'No trial listed'}</dd></div>
                  </dl>
                  {features.length > 0 && <details className="pricing-mobile-features"><summary>View catalog features</summary><dl>{features.map(feature => <div key={feature}><dt>{featureLabel(feature)}</dt><dd>{featureValue(plan.features[feature])}</dd></div>)}</dl></details>}
                  <button type="button" className="onboarding-button onboarding-primary" onClick={() => onSelectPlan(plan.code, billingCycle)}>Choose {plan.displayName}</button>
                </article>)}
              </section>
              <section className="pricing-features" aria-labelledby="pricing-features-title">
                <h2 id="pricing-features-title">Compare plan features</h2>
                <p className="onboarding-muted">These are catalog listings, not confirmation that an integration or workflow is operational. Services may require separate configuration.</p>
                {features.length ? <div className="pricing-comparison" role="region" aria-label="Scrollable plan feature comparison" tabIndex={0}>
                  <table><caption>Current catalog feature listings</caption><thead><tr><th scope="col">Feature</th>{plans.map(plan => <th scope="col" key={plan.code}>{plan.displayName}</th>)}</tr></thead>
                    <tbody>{features.map(feature => <tr key={feature}><th scope="row">{featureLabel(feature)}</th>{plans.map(plan => <td key={plan.code}>{featureValue(plan.features[feature])}</td>)}</tr>)}</tbody>
                  </table>
                </div> : <p>No feature listings have been published for these plans.</p>}
              </section>
              <section className="pricing-faq" aria-labelledby="pricing-faq-title"><h2 id="pricing-faq-title">Pricing questions</h2>
                <details><summary>How is annual pricing calculated?</summary><p>The monthly equivalent is the total annual price divided by 12. It is not a monthly payment schedule; the full annual amount is listed on each plan.</p></details>
                <details><summary>Are taxes included?</summary><p>Catalog prices are in INR and exclude GST. GST is extra.</p></details>
                <details><summary>Which plans list a trial?</summary><ul>{plans.map(plan => <li key={plan.code}><strong>{plan.displayName}:</strong> {plan.trialDays > 0 ? `${plan.trialDays}-day trial.` : 'No trial listed.'}</li>)}</ul></details>
              </section>
            </>}
        <nav className="pricing-legal" aria-label="Legal documents"><a href="/?legal=terms" target="_blank" rel="noopener noreferrer">Terms of Service (new tab)</a><a href="/?legal=privacy" target="_blank" rel="noopener noreferrer">Privacy Policy (new tab)</a></nav>
      </div>
    </main>
  </div>;
}
