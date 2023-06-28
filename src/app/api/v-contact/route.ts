import { openai } from "@/utils/openai";
import { NextResponse } from "next/server";
import path from "path";
import vCardsJs from "vcards-js";

export async function GET(request: Request) {
  console.log("got a GET request");
  let response = NextResponse.next();
  const newHeaders = new Headers(request.headers);

  //create a new vCard
  const vCard = vCardsJs();

  //set properties
  vCard.firstName = "Amino";
  vCard.organization = "Amino Fitness";

  const logoPath = path.join(
    __dirname,
    "../../../../../public/logos/vContactLogo.png"
  );
  console.log("__dirname", __dirname);
  console.log("__dirname", logoPath);
  vCard.photo.embedFromFile(logoPath);
  vCard.workPhone = process.env.TWILIO_PHONE_NUMBER || "+15555555555";
  // vCard.birthday = new Date(2008, 3, 18);
  // vCard.title = 'Company';
  vCard.url = "https://amino.fit";

  //set content-type and disposition including desired filename
  newHeaders.set("Content-Type", 'text/vcard; name="amino-contact.vcf"');
  newHeaders.set("Content-Disposition", 'inline; filename="amino-contact.vcf"');

  return new Response(vCard.getFormattedString(), {
    // New request headers
    headers: newHeaders,
  });
}
