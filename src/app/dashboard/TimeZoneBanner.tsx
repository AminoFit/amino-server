"use client";

import { XMarkIcon } from "@heroicons/react/20/solid";
import { User } from "@prisma/client";
import moment from "moment-timezone";
import { useEffect, useState } from "react";
import { updateTimeZone } from "./settings/actions";
import classNames from "classnames";

export function TimeZoneBanner({ user }: { user: User }) {
  const tz = moment.tz.guess();

  const [showing, setShowing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (moment.tz(tz).format() !== moment.tz(user.tzIdentifier).format()) {
      console.log("moment.tz(tz)", moment.tz(tz).format());
      console.log("user.tzIdentifier", user.tzIdentifier);
      console.log(
        "moment.tz(user.tzIdentifier)",
        moment.tz(user.tzIdentifier).format()
      );
      setShowing(true);
    }
  }, [user.tzIdentifier, tz]);

  const handleUpdate = async () => {
    await updateTimeZone(tz);
    setShowing(false);
  };

  if (!showing) return;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 sm:flex sm:justify-center sm:px-6 sm:pb-5 lg:px-8">
      <div className="pointer-events-auto flex items-center justify-between gap-x-6 bg-gray-900 px-6 py-2.5 sm:rounded-xl sm:py-3 sm:pl-4 sm:pr-3.5">
        <p className="text-sm leading-6 text-white">
          <a href="#">
            <strong className="font-semibold">Time Zone</strong>
            <svg
              viewBox="0 0 2 2"
              className="mx-2 inline h-0.5 w-0.5 fill-current"
              aria-hidden="true"
            >
              <circle cx={1} cy={1} r={1} />
            </svg>
            You are currently in the <strong>{tz}</strong> time zone, but your
            profile is set to <strong>{user.tzIdentifier}</strong>.
          </a>
        </p>
        <button
          type="button"
          className={classNames("text-white", {
            "opacity-50": submitting,
          })}
          onClick={handleUpdate}
          disabled={submitting}
        >
          <span className="sr-only">Update</span>
          Update
        </button>
        <button type="button" className="-m-1.5 flex-none p-1.5">
          <span className="sr-only">Dismiss</span>
          <XMarkIcon className="h-5 w-5 text-white" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
