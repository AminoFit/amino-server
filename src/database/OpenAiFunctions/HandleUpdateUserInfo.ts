import { User } from "@prisma/client";
import { prisma } from "../prisma";
import moment from "moment";

export async function HandleUpdateUserInfo(user: User, parameters: any) {
  console.log("HandleUpdateUserInfo");
  console.log("parameters", parameters);

  const updates = [];

  if (parameters.users_name) {
    console.log("updating user name to", parameters.users_name);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        firstName: parameters.users_name,
      },
    });
    updates.push(`I updated your name, ${parameters.users_name}.`);
  }

  if (parameters.user_date_of_birth) {
    console.log("updating user DOB to", parameters.user_date_of_birth);
    const dob = new Date(parameters.user_date_of_birth);
    console.log("dob", dob);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        dateOfBirth: dob,
      },
    });

    updates.push(
      `Your date of birth has been updated, ${moment(dob).format(
        "MMMM Do YYYY"
      )}.`
    );
  }
  if (parameters.users_weight) {
    console.log("updating user weight to", parameters.users_weight);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        weightLbs: parameters.users_weight,
      },
    });

    updates.push(
      `Your weight has been updated to: ${parameters.users_weight}lbs.`
    );
  }

  if (updates.length === 0) {
    return "Sorry, I couldn't update your info, please try again.";
  }
  return updates.join("\n\n");
}
