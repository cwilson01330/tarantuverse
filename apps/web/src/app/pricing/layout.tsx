/**
 * Server layout for /pricing — exists only to give the (client) pricing page
 * its own title, description and canonical, plus FAQPage JSON-LD for the FAQ
 * the page visibly shows.
 *
 * KEEP IN SYNC: the questions and answers below are copied word for word from
 * the "Frequently Asked Questions" section of ./page.tsx. Structured data may
 * only describe what a visitor can see, so edit both together (or drop a Q
 * here when it's dropped there).
 */
import type { Metadata } from 'next'
import { SITE } from '@/lib/app-listing'

const TITLE = 'Tarantuverse Pricing: Free for 15 Animals, Premium $4.99/mo'
const DESCRIPTION =
  'Free for up to 15 animals with 5 photos each. Premium: $4.99/month, $44.99/year or $149.99 lifetime — unlimited animals, breeding module and co-keepers.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE}/pricing` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE}/pricing`,
    type: 'website',
    siteName: 'Tarantuverse',
  },
}

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Can I change plans later?',
    a: 'Yes! You can upgrade at any time. If you have a promo code, you can redeem it in your settings.',
  },
  {
    q: 'What happens if I exceed my plan limits?',
    a: "We'll show you a friendly upgrade prompt when you hit your limit. Your data is never deleted, and you can upgrade anytime.",
  },
  {
    q: 'Do you offer promo codes?',
    a: 'Yes! Early adopters may receive promo codes for free premium access. If you have a code, you can redeem it in your account settings.',
  },
  {
    q: 'Do my sitter and co-keepers need Premium?',
    a: "No. A sitter doesn't need an account at all, and joining someone else's collection as a co-keeper is free. Premium is only needed to invite co-keepers to your collection and to let a sitter log feedings.",
  },
  {
    q: 'Does this cover Herpetoverse too?',
    a: 'Tarantuverse Premium covers Tarantuverse. If you keep reptiles or amphibians as well, the All-Access plan covers both apps with one subscription — see Herpetoverse pricing.',
  },
  {
    q: 'Can I cancel my monthly subscription?',
    a: 'Absolutely! Monthly plans can be canceled anytime from your account settings. No long-term contracts.',
  },
]

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {children}
    </>
  )
}
