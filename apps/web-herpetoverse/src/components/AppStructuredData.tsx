/**
 * Organization + WebSite + SoftwareApplication JSON-LD for Herpetoverse,
 * emitted from the root layout (a server component) so it is in the initial
 * HTML — the landing page itself is a client component.
 *
 * Only true, visible facts: the free cap and plan prices are the ones on
 * /pricing. No aggregateRating — there is no store rating to report yet, and
 * inventing one is the kind of thing that gets a site penalised.
 *
 * The Organization @id matches the one Tarantuverse emits, so both sites
 * resolve to the same publisher.
 */
import {
  APP_STORE_URL,
  LEGAL_ENTITY,
  PLAY_STORE_URL,
  PREMIUM_PRICES_USD,
  SITE,
} from '@/lib/app-listing'

export default function AppStructuredData() {
  const orgId = `${LEGAL_ENTITY.url}/#organization`

  const organization = {
    '@type': 'Organization',
    '@id': orgId,
    name: LEGAL_ENTITY.name,
    url: LEGAL_ENTITY.url,
    email: LEGAL_ENTITY.email,
    brand: ['Tarantuverse', 'Herpetoverse'],
  }

  const website = {
    '@type': 'WebSite',
    '@id': `${SITE}/#website`,
    name: 'Herpetoverse',
    url: SITE,
    publisher: { '@id': orgId },
    about: { '@id': `${SITE}/#app` },
  }

  const application = {
    '@type': ['SoftwareApplication', 'MobileApplication'],
    '@id': `${SITE}/#app`,
    name: 'Herpetoverse',
    url: SITE,
    description:
      'Husbandry tracker for reptile and amphibian keepers. Log feedings, ' +
      'sheds and weights for snakes, lizards, geckos, turtles, tortoises, frogs ' +
      'and salamanders, with species care sheets and breeding records.',
    applicationCategory: 'LifestyleApplication',
    operatingSystem: 'iOS, Android, Web',
    image: `${SITE}/logo.svg`,
    installUrl: [APP_STORE_URL, PLAY_STORE_URL],
    sameAs: [APP_STORE_URL, PLAY_STORE_URL],
    publisher: { '@id': orgId },
    offers: [
      { '@type': 'Offer', name: 'Free (up to 5 animals)', price: 0, priceCurrency: 'USD' },
      { '@type': 'Offer', name: 'Premium monthly', price: PREMIUM_PRICES_USD.monthly, priceCurrency: 'USD' },
      { '@type': 'Offer', name: 'Premium yearly', price: PREMIUM_PRICES_USD.yearly, priceCurrency: 'USD' },
      { '@type': 'Offer', name: 'Premium lifetime', price: PREMIUM_PRICES_USD.lifetime, priceCurrency: 'USD' },
    ],
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
