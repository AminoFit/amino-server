export async function GET(request: Request, response: Response) {
  response.status(200).json({ name: "John Doe" });
}
