import { getServerSession } from "next-auth/next"
import { authOptions } from "@/app/api/auth/[...nextauth]/auth-options"

const API_URL = process.env.NEXT_PUBLIC_API_URL

const species_images = {
  "Grammostola rosea": "/species-images/grammostola_rosea.jpg",
  "Brachypelma hamorii": "/species-images/brachypelma_hamorii.jpg",
  "Aphonopelma chalcodes": "/species-images/aphonopelma_chalcodes.jpg",
  "Caribena versicolor": "/species-images/caribena_versicolor.jpg",
  "Tliltocatl albopilosus": "/species-images/tliltocatl_albopilosus.jpg",
}

export async function POST() {
  try {
    // Get the session (includes access token)
    const session = await getServerSession(authOptions)

    if (!session?.accessToken) {
      return Response.json(
        { error: "Not authenticated" },
        { status: 401 }
      )
    }

    const headers = {
      "Authorization": `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    }

    // Get all species
    const speciesRes = await fetch(`${API_URL}/api/v1/species/`, { headers })
    if (!speciesRes.ok) {
      throw new Error("Failed to fetch species")
    }

    const allSpecies = await speciesRes.json()

    const results = []

    // Update each species with an image
    for (const [scientificName, imageUrl] of Object.entries(species_images)) {
      const species = allSpecies.find((s: any) => s.scientific_name === scientificName)

      if (!species) {
        results.push({
          species: scientificName,
          status: "not_found",
          message: "Species not in database",
        })
        continue
      }

      if (species.image_url) {
        results.push({
          species: scientificName,
          status: "skipped",
          message: `Already has image: ${species.image_url}`,
        })
        continue
      }

      // Update the species
      const updateData = { ...species, image_url: imageUrl }
      const updateRes = await fetch(
        `${API_URL}/api/v1/species/${species.id}`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify(updateData),
        }
      )

      if (updateRes.ok) {
        results.push({
          species: scientificName,
          status: "success",
          message: `Updated with ${imageUrl}`,
        })
      } else {
        const errorText = await updateRes.text()
        results.push({
          species: scientificName,
          status: "failed",
          message: `Failed: ${updateRes.status} - ${errorText}`,
        })
      }
    }

    const successCount = results.filter((r) => r.status === "success").length

    return Response.json({
      success: true,
      summary: `Updated ${successCount}/${Object.keys(species_images).length} species`,
      results,
    })
  } catch (error: any) {
    return Response.json(
      { error: error.message || "Failed to update species" },
      { status: 500 }
    )
  }
}
