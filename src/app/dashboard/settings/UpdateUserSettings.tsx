"use client";
import { User } from "@prisma/client";
import classNames from "classnames";
import { useEffect, Fragment, useState } from "react";
import { updateUserSettings, updateUserPreferences } from "./actions";
import { Transition, Listbox } from '@headlessui/react';
import tzData from "./timezones.json";
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/24/solid';

const secondaryNavigation = [
  { name: "Account", href: "#", current: true },
  { name: "Notifications", href: "#", current: false, disabled: true },
  { name: "Billing", href: "#", current: false, disabled: true },
  { name: "Teams", href: "#", current: false, disabled: true },
  { name: "Integrations", href: "#", current: false, disabled: true },
];

export default function UpdateUserSettings({ user }: { user: User }) {
  const [tzIdentifier, setTxIdentifier] = useState(user.tzIdentifier);
  const [firstName, setFirstName] = useState(user.firstName || "");
  const [lastName, setLastName] = useState(user.lastName || "");

  // Unit preference variables
  const [unitPreference, setUnitPreference] = useState(user.unitPreference || "IMPERIAL");
  const unitOptions = [
    { name: "Imperial (U.S.)", value: "IMPERIAL" },
    { name: "Metric", value: "METRIC" }
  ];

  const [submittingPreferences, setSubmittingPreferences] = useState(false);
  const [successMessagePreferences, setSuccessMessagePreferences] = useState("");

  const [submittingPersonal, setSubmittingPersonal] = useState(false);
  const [successMessagePersonal, setSuccessMessagePersonal] = useState("");

  // setup birthday
  const extractDateParts = (date: Date | null) => {
    if (!date) return ["", "", ""];
    return [date.getDate().toString(), (date.getMonth() + 1).toString(), date.getFullYear().toString()];
  };

  const [birthDayRead, birthMonthRead, birthYearRead] = user.dateOfBirth ? extractDateParts(new Date(user.dateOfBirth)) : ["", "", ""];

  const [birthDay, setBirthDay] = useState(birthDayRead);
  const [birthMonth, setBirthMonth] = useState(birthMonthRead);
  const [birthYear, setBirthYear] = useState(birthYearRead);

  const validateDateInput = (value: string, maxLength: number) => {
    const regex = new RegExp(`^0*\\d{0,${maxLength}}$`);
    return regex.test(value);
  };

  const validateMonth = (value: string) => {
    if (value === "" || value === "0") return true; // Allow temporary empty or "0" values for editing
    const num = parseInt(value, 10);
    return num >= 1 && num <= 12;
  };

  const validateDay = (value: string) => {
    if (value === "" || value === "0") return true; // Allow temporary empty or "0" values for editing
    const num = parseInt(value, 10);
    const maxDay = new Date(parseInt(birthYear || '2000', 10), parseInt(birthMonth, 10), 0).getDate();
    return num >= 1 && num <= maxDay;
  };

  // User stats (height & weight)
  const toImperialWeight = (kg: number | null): number | null => {
    if (kg === null) {
      return null;
    }
    return Number((kg * 2.20462).toFixed(0));
  };
  const toMetricHeight = (inch: number | null): number | null => {
    if (inch === null) {
      return null;
    }
    return inch * 2.54;
  };
  const toMetricWeight = (lbs: number | null): number | null => {
    if (lbs === null) {
      return null;
    }
    return Number((lbs / 2.20462).toFixed(1));
  };
  const toImperialHeight = (cm: number) => cm / 2.54;
  const [weightKg, setWeightKg] = useState(user.weightKg);
  const [weightLbs, setWeightLbs] = useState(toImperialWeight(user.weightKg));
  const [heightCm, setHeightCm] = useState(user.heightCm);
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');



  const cmToFeetInches = (cm: number | null) => {
    if (cm === null) return { feet: '', inches: '' };
    const totalInches = Math.round(cm / 2.54);
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return { feet: feet.toString(), inches: inches.toString() };
  };

  const feetInchesToCm = (feet: string | null, inches: string | null): number | null => {
    if (feet === null || inches === null) {
      return null;
    }

    const feetNum = parseInt(feet, 10);
    const inchesNum = parseInt(inches, 10);

    // If either parsed value is NaN, return null
    if (isNaN(feetNum) || isNaN(inchesNum)) {
      return null;
    }

    const totalCm = Math.round((feetNum * 12 + inchesNum) * 2.54);

    return totalCm;
  };



  useEffect(() => {
    if (unitPreference === 'METRIC') {
      setHeightCm(feetInchesToCm(heightFeet, heightInches));
      setWeightKg(toMetricWeight(weightLbs))
    } else if (unitPreference === 'IMPERIAL') {
      const { feet, inches } = cmToFeetInches(heightCm);
      setHeightFeet(feet);
      setHeightInches(inches);
      setWeightLbs(toImperialWeight(weightKg))
    }
  }, [unitPreference]);


  useEffect(() => {
    if (user.heightCm && user.unitPreference === "IMPERIAL") {
      const totalInches = toImperialHeight(user.heightCm);
      const feet = Math.floor(totalInches / 12);
      const inches = Math.round(totalInches % 12);

      setHeightFeet(feet.toString());
      setHeightInches(inches.toString());
    }
  }, [user]);

  const handleSubmitPersonalInfo = async () => {
    setSuccessMessagePersonal("");
    setSubmittingPersonal(true);

    // Convert individual day, month, year to a JavaScript Date object
    const dateOfBirth = new Date(parseInt(birthYear, 10), parseInt(birthMonth, 10) - 1, parseInt(birthDay, 10));

    await updateUserSettings({ tzIdentifier, firstName, lastName, dateOfBirth, weightKg, heightCm })
      .then(() => {
        setSubmittingPersonal(false);
        setSuccessMessagePersonal(
          "Successfully updated your personal information"
        );
      })
      .catch(() => {
        setSuccessMessagePersonal("Error updating your personal information");
      });
  };


  const handleSavePreferences = async () => {
    setSuccessMessagePreferences("");
    setSubmittingPreferences(true);
    await updateUserPreferences({ unitPreference })
      .then(() => {
        setSubmittingPreferences(false);
        setSuccessMessagePreferences(
          "Successfully updated your preferences"
        );
      })
      .catch(() => {
        setSuccessMessagePreferences("Error updating your preferences");
      });
  };

  return (
    <main>
      <header className="border-b border-grey/5">
        {/* Secondary navigation */}
        <nav className="flex overflow-x-auto py-4">
          <ul
            role="list"
            className="flex min-w-full flex-none gap-x-6 px-4 text-sm font-semibold leading-6 text-gray-400 sm:px-6 lg:px-8"
          >
            {secondaryNavigation.map((item) => (
              <li key={item.name}>
                <a
                  href={item.href}
                  className={classNames(
                    item.current
                      ? "bg-gray-50 text-indigo-600"
                      : "text-gray-700 hover:text-indigo-600 hover:bg-gray-50",
                    "group flex gap-x-3 rounded-md py-2 pl-2 pr-3 text-sm leading-6 font-semibold",
                    { "pointer-events-none opacity-30": item.disabled }
                  )}
                >
                  {item.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {/* Settings forms */}

      <div className="divide-y divide-grey/5">
        <div className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
          <div>
            <h2 className="text-base font-semibold leading-7 text-grey">
              Personal Information
            </h2>
            <p className="mt-1 text-sm leading-6 text-gray-400">
              Use a permanent address where you can receive mail.
            </p>
          </div>
          <div className="md:col-span-2">
            <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:max-w-xl sm:grid-cols-6">
              {/* <div className="col-span-full flex items-center gap-x-8">
                <img
                  src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
                  alt=""
                  className="h-24 w-24 flex-none rounded-lg bg-gray-800 object-cover"
                />
                <div>
                  <button
                    type="button"
                    className="rounded-md bg-indigo-600 text-white px-3 py-2 text-sm font-semibold shadow-sm hover:bg-indigo-600/80"
                  >
                    Change avatar
                  </button>
                  <p className="mt-2 text-xs leading-5 text-gray-400">
                    JPG, GIF or PNG. 1MB max.
                  </p>
                </div>
              </div> */}

              <div className="sm:col-span-3">
                <label
                  htmlFor="first-name"
                  className="block text-sm font-medium leading-6 text-grey"
                >
                  First name
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    name="first-name"
                    id="first-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <div className="sm:col-span-3">
                <label
                  htmlFor="last-name"
                  className="block text-sm font-medium leading-6 text-grey"
                >
                  Last name
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    name="last-name"
                    id="last-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              {/* <div className="col-span-full">
                <label
                  htmlFor="email"
                  className="block text-sm font-medium leading-6 text-grey"
                >
                  Email address
                </label>
                <div className="mt-2">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div> */}
              <div className="sm:col-span-6 col-span-full">
                <label htmlFor="timezone" className="block text-sm font-medium leading-6 text-grey">
                  Timezone
                </label>
                <div className="mt-2"></div>
                <select
                  value={tzIdentifier}
                  onChange={(e) => setTxIdentifier(e.target.value)}
                  id="timezone"
                  name="timezone"
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                >
                  {tzData.map((tz) => {
                    const options = [];
                    options.push(
                      <option
                        value={tz.utc[0]}
                        key={tz.text + "space"}
                        disabled
                      >
                        &nbsp;
                      </option>
                    );
                    options.push(
                      <option value={tz.utc[0]} key={tz.text} disabled>
                        {tz.text}
                      </option>
                    );
                    tz.utc.forEach((child) => {
                      options.push(
                        <option value={child} key={child}>
                          {child}
                        </option>
                      );
                    });
                    return options;
                  })}
                </select>
              </div>

              <div className="sm:col-span-6 col-span-full">
                <label className="block text-sm font-medium leading-6 text-grey">
                  Date of Birth
                </label>
                <div className="mt-2 flex gap-x-2">
                  <input
                    type="text"
                    placeholder="MM"
                    value={birthMonth}
                    onChange={(e) => {
                      if (validateDateInput(e.target.value, 2) && validateMonth(e.target.value)) {
                        setBirthMonth(e.target.value);
                      }
                    }}
                    className="block w-12 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                  <input
                    type="text"
                    placeholder="DD"
                    value={birthDay}
                    onChange={(e) => {
                      if (validateDateInput(e.target.value, 2) && validateDay(e.target.value)) {
                        setBirthDay(e.target.value);
                      }
                    }}
                    className="block w-12 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                  <input
                    type="text"
                    placeholder="YYYY"
                    value={birthYear}
                    onChange={(e) => {
                      if (validateDateInput(e.target.value, 4)) {
                        setBirthYear(e.target.value);
                        if (birthMonth && birthDay) {
                          validateDay(birthDay); // Revalidate day when year changes
                        }
                      }
                    }}
                    className="block w-20 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <div className="sm:col-span-3 col-span-full">
                <label className="block text-sm font-medium leading-6 text-grey">
                  Height
                </label>
                <div className="mt-2 flex gap-x-2 items-center">
                  {unitPreference === "METRIC" ? (
                    <>
                      <input
                        type="number"
                        min="0"
                        placeholder="175"
                        value={heightCm !== null ? heightCm.toString() : ""}
                        onChange={(e) => {
                          let value = parseInt(e.target.value, 10);
                          if (value < 0) value = 0; 
                          if (value > 350) value = 350; 
                          setHeightCm(value ? value : null);
                        }}
                        className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                      />
                      <span className="text-sm text-gray-600">cm</span>
                    </>
                  ) : (
                    <>
                      <input
                        type="number"
                        min="0"
                        placeholder="6"
                        value={heightFeet}
                        onChange={(e) => {
                          let value = parseInt(e.target.value, 10);
                          if (value < 0) value = 0; 
                          if (value > 9) value = 9; 
                          setHeightFeet(value ? value.toString() : "");
                      }}
                        className="block w-16 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                      />
                      <span className="text-sm text-gray-600">ft</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="3"
                        value={heightInches}
                        onChange={(e) => {
                          let value = parseInt(e.target.value, 10);
                          if (value < 0) value = 0;
                          if (value > 11) value = 11; 
                          setHeightInches(value ? value.toString() : "");
                      }}
                        className="block w-16 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                      />
                      <span className="text-sm text-gray-600">in</span>
                    </>
                  )}
                </div>
              </div>

              <div className="sm:col-span-3 col-span-full">
                <label className="block text-sm font-medium leading-6 text-grey">
                  Weight
                </label>
                <div className="mt-2 flex gap-x-2 items-center">
                  {unitPreference === "METRIC" ? (
                    <>
                      <input
                        type="number"
                        min="0"
                        placeholder="70"
                        value={weightKg !== null ? weightKg.toString() : ""}
                        onChange={(e) => {
                          let value = parseInt(e.target.value, 10);
                          if (value < 0) value = 0; 
                          setWeightKg(value ? value : null);
                      }}
                        className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                      />
                      <span className="text-sm text-gray-600">kg</span>
                    </>
                  ) : (
                    <>
                      <input
                        type="number"
                        min="0"
                        placeholder="160"
                        value={weightLbs !== null ? weightLbs.toString() : ""}
                        onChange={(e) => {
                          let value = parseInt(e.target.value, 10);
                          if (value < 0) value = 0; 
                          setWeightLbs(value ? value : null);
                        }}
                        className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                      />
                      <span className="text-sm text-gray-600">lbs</span>
                    </>
                  )}
                </div>
              </div>


            </div>

            <div className="mt-8 flex">
              <button
                disabled={submittingPersonal}
                onClick={handleSubmitPersonalInfo}
                className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-70"
              >
                {submittingPersonal ? "Saving..." : "Save"}
              </button>
            </div>
            {successMessagePersonal && (
              <div className="mt-8 flex text-sm text-green-600">
                {successMessagePersonal}
              </div>
            )}
          </div>
        </div>

        <div className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
          <div>
            <h2 className="text-base font-semibold leading-7 text-grey">
              Preferences
            </h2>
            <p className="mt-1 text-sm leading-6 text-gray-400">
              Choose your unit preferences.
            </p>
          </div>

          <div className="md:col-span-2">
            <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:max-w-xl sm:grid-cols-6">
              <div className="col-span-full">
                <label htmlFor="unit-preference" className="block text-sm font-medium leading-6 text-grey">
                  Unit Preference
                </label>
                <div className="top-16 w-72">
                  <Listbox value={unitPreference} onChange={setUnitPreference}>
                    <div className="relative mt-1">
                      <Listbox.Button className="relative w-full cursor-default rounded-lg bg-white py-2 pl-3 pr-10 text-left shadow-md focus:outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 focus-visible:ring-offset-2 focus-visible:ring-offset-orange-300 sm:text-sm">
                        <span className="block truncate">{unitOptions.find(option => option.value === unitPreference)?.name || unitPreference}</span>
                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                          <ChevronUpDownIcon
                            className="h-5 w-5 text-gray-400"
                            aria-hidden="true"
                          />
                        </span>
                      </Listbox.Button>
                      <Transition
                        as={Fragment}
                        leave="transition ease-in duration-100"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                      >
                        <Listbox.Options className="absolute mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                          {unitOptions.map((option) => (
                            <Listbox.Option
                              key={option.value}
                              className={({ active }) =>
                                `relative cursor-default select-none py-2 pl-10 pr-4 ${active ? 'bg-blue-100 text-blue-900' : 'text-gray-900'
                                }`
                              }
                              value={option.value}
                            >
                              {({ selected }) => (
                                <>
                                  <span
                                    className={`block truncate ${selected ? 'font-medium' : 'font-normal'
                                      }`}
                                  >
                                    {option.name}
                                  </span>
                                  {selected ? (
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-600">
                                      <CheckIcon className="h-5 w-5" aria-hidden="true" />
                                    </span>
                                  ) : null}
                                </>
                              )}
                            </Listbox.Option>
                          ))}
                        </Listbox.Options>
                      </Transition>
                    </div>
                  </Listbox>
                </div>
              </div>
            </div>
            <div className="mt-8 flex">
              <button
                disabled={submittingPreferences}
                onClick={handleSavePreferences}
                className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-70"
              >
                {submittingPreferences ? "Saving..." : "Save"}
              </button>
            </div>
            {successMessagePreferences && (
              <div className="mt-8 flex text-sm text-green-600">
                {successMessagePreferences}
              </div>
            )}
          </div>
        </div>

        <div className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8 opacity-20 pointer-events-none">
          <div>
            <h2 className="text-base font-semibold leading-7 text-grey">
              Change password
            </h2>
            <p className="mt-1 text-sm leading-6 text-gray-400">
              Update your password associated with your account.
            </p>
          </div>

          <form className="md:col-span-2">
            <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:max-w-xl sm:grid-cols-6">
              <div className="col-span-full">
                <label
                  htmlFor="current-password"
                  className="block text-sm font-medium leading-6 text-grey"
                >
                  Current password
                </label>
                <div className="mt-2">
                  <input
                    id="current-password"
                    name="current_password"
                    type="password"
                    autoComplete="current-password"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <div className="col-span-full">
                <label
                  htmlFor="new-password"
                  className="block text-sm font-medium leading-6 text-grey"
                >
                  New password
                </label>
                <div className="mt-2">
                  <input
                    id="new-password"
                    name="new_password"
                    type="password"
                    autoComplete="new-password"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <div className="col-span-full">
                <label
                  htmlFor="confirm-password"
                  className="block text-sm font-medium leading-6 text-grey"
                >
                  Confirm password
                </label>
                <div className="mt-2">
                  <input
                    id="confirm-password"
                    name="confirm_password"
                    type="password"
                    autoComplete="new-password"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 flex">
              <button
                type="submit"
                className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
              >
                Save
              </button>
            </div>
          </form>
        </div>

        <div className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8 opacity-20 pointer-events-none">
          <div>
            <h2 className="text-base font-semibold leading-7 text-grey">
              Delete account
            </h2>
            <p className="mt-1 text-sm leading-6 text-gray-400">
              No longer want to use our service? You can delete your account
              here. This action is not reversible. All information related to
              this account will be deleted permanently.
            </p>
          </div>

          <form className="flex items-start md:col-span-2">
            <button
              type="submit"
              className="rounded-md bg-red-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-400"
            >
              Yes, delete my account
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
