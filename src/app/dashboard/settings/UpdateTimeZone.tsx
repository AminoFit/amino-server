"use client";
import { User } from "@prisma/client";
import { getUser, updateTimeZone } from "./actions";
import tzData from "./timezones.json";
import { useState } from "react";

export default function UpdateTimeZone({ user }: { user: User }) {
  // console.log("messages", messages);

  const [tz, setTz] = useState(user.tzIdentifier);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    console.log("submit");
    setSuccessMessage("");
    setSubmitting(true);
    await updateTimeZone(tz);
    setSubmitting(false);
    setSuccessMessage("Timezone Update to " + tz);
  };

  return (
    <div className="">
      <div className="">
        <div>
          <h2 className="text-base font-semibold leading-7">
            Personal Information
          </h2>
          <p className="mt-1 text-sm leading-6 text-gray-400">
            Update your timezone and other personal information.
          </p>
        </div>

        <div className="mt-7">
          <label
            htmlFor="timezone"
            className="block text-sm font-medium leading-6 text-gray-900"
          >
            Time Zone
          </label>
          <div className="mt-2">
            <select
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              id="timezone"
              name="timezone"
              className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:max-w-xs sm:text-sm sm:leading-6"
            >
              {tzData.map((tz) => {
                const options = [];
                options.push(
                  <option value={tz.utc[0]} key={tz.text}>
                    {tz.text}
                  </option>
                );
                tz.utc.forEach((child) => {
                  options.push(
                    <option value={child} key={child}>
                      &nbsp;&nbsp;&nbsp;&nbsp;{child}
                    </option>
                  );
                });
                return options;
              })}
            </select>
          </div>
        </div>
        {successMessage && (
          <div className="mt-3 text-emerald-500 text-sm">{successMessage}</div>
        )}

        <div className="mt-8 flex">
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={submitting}
            className="text-white rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            {submitting ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
