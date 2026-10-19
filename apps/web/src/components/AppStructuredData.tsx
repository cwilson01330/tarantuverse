/**
 * Organization + WebSite + SoftwareApplication JSON-LD, emitted on every page
 * from the root layout.
 *
 * Server-rendered so crawlers see it without executing JavaScript.
 *
 * WHAT GOOGLE REQUIRES (developers.google.com/search/docs/appearance/
 * structured-data/software-app): `name`, `offers.price`, and EITHER
 * `aggregateRating` OR `review`. A free app sets price to 0 — that satisfies
 * the offer requirement, it doesn't mean "no offer".
 *
 * The rating is conditional. Without it the markup is still valid and still
 * describes the app; it just isn't eligible for the star rich result. That
 * trade is deliberate — see lib/app-listing.ts. Inventing a rating to unlock a
 * search feature is the exact thing Google issues manual actions for, and it
 * would be a lie told to keepers deciding whether to trust the app.
 *
 * Two entities, linked: the app, and the LLC that publishes it. The
 * Organization node lets Google connect Tarantuverse, Herpetoverse and the
 * storefront as one publisher rather than three unrelated domains.
 */
import {
  APP_RATING,
  APP_STORE_URL,
  LEGAL_ENTITY,
  PLAY_STORE_URL,
  SITE,
} from '@/lib/app-listing'

export default function AppStructuredData() {
  const organization = {
    '@type': 'Organization',
    '@id': `${LEGAL_ENTITY.url}/#organization`,
    name: LEGAL_ENTITY.name,
    url: LEGAL_ENTITY.url,
    email: LEGAL_ENTITY.email,
    // Everything this entity publishes, so the properties resolve as siblings.
    brand: ['Tarantuverse', 'Herpetoverse'],
  }

  const application = {
    '@type': ['SoftwareApplication', 'MobileApplication'],
    '@id': `${SITE}/#app`,
    name: 'Tarantuverse',
    url: SITE,
    description:
      'Husbandry tracker for invertebrate keepers. Log feedings, molts and ' +
      'substrate changes across tarantulas, scorpions, centipedes and more, ' +
      'with species care sheets and breeding records.',
    applicationCategory: 'LifestyleApplication',
    operatingSystem: 'iOS, Android, Web',
    image: `${SITE}/logo.png`,
    installUrl: [APP_STORE_URL, PLAY_STORE_URL],
    publisher: { '@id': `${LEGAL_ENTITY.url}/#organization` },
    // The plans exactly as /pricing lists them (web checkout, USD). The free
    // offer stays FIRST: price 0 is what Google expects for a free app.
    // Change these together with the pricing page.
    offers: [
      { '@type': 'Offer', name: 'Free (up to 15 animals)', price: 0, priceCurrency: 'USD' },
      { '@type': 'Offer', name: 'Premium monthly', price: 4.99, priceCurrency: 'USD' },
      { '@type': 'Offer', name: 'Premium yearly', price: 44.99, priceCurrency: 'USD' },
      { '@type': 'Offer', name: 'Premium lifetime', price: 149.99, priceCurrency: 'USD' },
    ],
    // The store listings are the same app, so assistants can join them up.
    sameAs: [APP_STORE_URL, PLAY_STORE_URL],
    ...(APP_RATING
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: APP_RATING.value,
            // Required by Google alongside the value, and the honest half of
            // the pair — an average means little without the sample size.
            ratingCount: APP_RATING.count,
            bestRating: APP_RATING.best,
          },
        }
      : {}),
  }

  // The site itself, so the name "Tarantuverse" resolves to this domain.
  const website = {
    '@type': 'WebSite',
    '@id': `${SITE}/#website`,
    name: 'Tarantuverse',
    url: SITE,
    publisher: { '@id': `${LEGAL_ENTITY.url}/#organization` },
    about: { '@id': `${SITE}/#app` },
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [organization, website, application],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}
