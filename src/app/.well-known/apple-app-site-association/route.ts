// Universal links: the consent page's QR code (/oauth/approve) opens the Amino app on an iPhone that has it.
export const dynamic = "force-static"

export function GET() {
  return Response.json({
    applinks: { details: [{ appIDs: ["9N572NAX6P.fit.amino"], components: [{ "/": "/oauth/approve*" }] }] }
  })
}
