'use client'

import { useState } from "react";

export function PhoneForm() {
  
  const [phoneNumber, setPhoneNumber] = useState('');

  return (
    <div>
      <label
        htmlFor="phone-number"
        className="block text-sm font-medium leading-6 text-gray-900 mt-8"
      >
        Get Started With Your Phone Number
      </label>
      <div>
        <div className="relative mt-2 rounded-md shadow-sm">
          <input
            type="text"
            name="phone-number"
            id="phone-number"
            className="block w-full rounded-md border-0 p-3.5  text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
            placeholder="+1 (555) 987-6543"
          />
        </div>
      </div>
    </div>
  );
}
