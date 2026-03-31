import { MetadataRoute } from 'next'

interface Species {
    id: string
    updated_at?: string
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = process.env.NEXTAUTH_URL || 'https://tarantuverse.com'
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

    // Static routes
    const routes = [
        '',
        '/blog',
        '/community',
        '/contact',
        '/features',
        '/help',
        '/login',
        '/pricing',
        '/privacy',
        '/register',
        '/species',
    ].map((route) => ({
        url: `${baseUrl}${route}`,
        lastModified: new Date(),
        changeFrequency: 'daily' as const,
        priority: route === '' ? 1 : 0.8,
    }))

    // Fetch dynamic species routes
    let speciesRoutes: MetadataRoute.Sitemap = []
    try {
        const response = await fetch(`${apiUrl}/api/v1/species?limit=1000`)
        if (response.ok) {
            const species: Species[] = await response.json()
            speciesRoutes = species.map((s) => ({
                url: `${baseUrl}/species/${s.id}`,
                lastModified: s.updated_at ? new Date(s.updated_at) : new Date(),
                changeFrequency: 'weekly' as const,
                priority: 0.6,
            }))
        }
    } catch (error) {
        console.error('Failed to fetch species for sitemap:', error)
    }

    return [...routes, ...speciesRoutes]
}
