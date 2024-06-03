import { ChatBubbleLeftIcon, CheckCircleIcon } from "@heroicons/react/24/outline"
import { log } from "console"

const messages = [
  {
    id: 4,
    createdAtDateTime: "2024-06-01T17:36:47Z",
    message: "I had Apple and Milk for breakfast",
    loggedFoodItems: [
      {
        id: 1,
        name: "Apple",
        brand: "Fresh Farm",
        knownAs: ["Red Apple", "Granny Smith"],
        description: "A juicy red apple",
        defaultServingWeightGram: 182.0,
        kcalPerServing: 95.0,
        totalFatPerServing: 0.3,
        satFatPerServing: 0.05,
        transFatPerServing: 0.0,
        carbPerServing: 25.0,
        sugarPerServing: 19.0,
        addedSugarPerServing: 0.0,
        proteinPerServing: 0.5,
        lastUpdated: "2024-06-01T17:36:47Z",
        verified: true,
        userId: "550e8400-e29b-41d4-a716-446655440000",
        messageId: 1,
        foodInfoSource: "User",
        adaEmbedding: null,
        UPC: 123456789012,
        defaultServingLiquidMl: null,
        externalId: "apple001",
        fiberPerServing: 4.4,
        isLiquid: false,
        weightUnknown: false,
        bgeBaseEmbedding: null,
        createdAtDateTime: "2024-06-01T17:36:47Z",
        foodItemCategoryID: "FRT",
        foodItemCategoryName: "Fruit"
      },
      {
        id: 2,
        name: "Milk",
        brand: "Dairy Best",
        knownAs: ["Whole Milk"],
        description: "Fresh whole milk",
        defaultServingWeightGram: 244.0,
        kcalPerServing: 150.0,
        totalFatPerServing: 8.0,
        satFatPerServing: 5.0,
        transFatPerServing: 0.0,
        carbPerServing: 12.0,
        sugarPerServing: 12.0,
        addedSugarPerServing: 0.0,
        proteinPerServing: 8.0,
        lastUpdated: "2024-06-01T17:36:47Z",
        verified: true,
        userId: "550e8400-e29b-41d4-a716-446655440001",
        messageId: 2,
        foodInfoSource: "User",
        adaEmbedding: null,
        UPC: 223456789012,
        defaultServingLiquidMl: 240.0,
        externalId: "milk001",
        fiberPerServing: null,
        isLiquid: true,
        weightUnknown: false,
        bgeBaseEmbedding: null,
        createdAtDateTime: "2024-06-01T17:36:47Z",
        foodItemCategoryID: "DAIRY",
        foodItemCategoryName: "Dairy"
      }
    ]
  },
  {
    id: 5,
    createdAtDateTime: "2024-06-01T17:36:47Z",
    message: "I had Banana and OJ",
    loggedFoodItems: [
      {
        id: 3,
        name: "Banana",
        brand: "Tropical Fruits",
        knownAs: [],
        description: "A ripe banana",
        defaultServingWeightGram: 118.0,
        kcalPerServing: 105.0,
        totalFatPerServing: 0.3,
        satFatPerServing: 0.11,
        transFatPerServing: 0.0,
        carbPerServing: 27.0,
        sugarPerServing: 14.0,
        addedSugarPerServing: 0.0,
        proteinPerServing: 1.3,
        lastUpdated: "2024-06-01T17:36:47Z",
        verified: false,
        userId: "550e8400-e29b-41d4-a716-446655440002",
        messageId: 3,
        foodInfoSource: "User",
        adaEmbedding: null,
        UPC: 323456789012,
        defaultServingLiquidMl: null,
        externalId: "banana001",
        fiberPerServing: 3.1,
        isLiquid: false,
        weightUnknown: false,
        bgeBaseEmbedding: null,
        createdAtDateTime: "2024-06-01T17:36:47Z",
        foodItemCategoryID: "FRT",
        foodItemCategoryName: "Fruit"
      },
      {
        id: 4,
        name: "Orange Juice",
        brand: "Citrus Valley",
        knownAs: ["OJ"],
        description: "Fresh squeezed orange juice",
        defaultServingWeightGram: 240.0,
        kcalPerServing: 110.0,
        totalFatPerServing: 0.2,
        satFatPerServing: 0.03,
        transFatPerServing: 0.0,
        carbPerServing: 26.0,
        sugarPerServing: 21.0,
        addedSugarPerServing: 0.0,
        proteinPerServing: 2.0,
        lastUpdated: "2024-06-01T17:36:47Z",
        verified: true,
        userId: "550e8400-e29b-41d4-a716-446655440003",
        messageId: 4,
        foodInfoSource: "User",
        adaEmbedding: null,
        UPC: 423456789012,
        defaultServingLiquidMl: 240.0,
        externalId: "oj001",
        fiberPerServing: 2.0,
        isLiquid: true,
        weightUnknown: false,
        bgeBaseEmbedding: null,
        createdAtDateTime: "2024-06-01T17:36:47Z",
        foodItemCategoryID: "FRT",
        foodItemCategoryName: "Fruit"
      },
      {
        id: 5,
        name: "Chicken Breast",
        brand: "Farm Poultry",
        knownAs: ["Grilled Chicken"],
        description: "Boneless skinless chicken breast, grilled",
        defaultServingWeightGram: 120.0,
        kcalPerServing: 165.0,
        totalFatPerServing: 3.5,
        satFatPerServing: 1.0,
        transFatPerServing: 0.0,
        carbPerServing: 0.0,
        sugarPerServing: 0.0,
        addedSugarPerServing: 0.0,
        proteinPerServing: 31.0,
        lastUpdated: "2024-06-01T17:36:47Z",
        verified: true,
        userId: "550e8400-e29b-41d4-a716-446655440004",
        messageId: 5,
        foodInfoSource: "User",
        adaEmbedding: null,
        UPC: 523456789012,
        defaultServingLiquidMl: null,
        externalId: "chicken001",
        fiberPerServing: null,
        isLiquid: false,
        weightUnknown: false,
        bgeBaseEmbedding: null,
        createdAtDateTime: "2024-06-01T17:36:47Z",
        foodItemCategoryID: "MEAT",
        foodItemCategoryName: "Meat"
      },
      {
        id: 6,
        name: "Almonds",
        brand: "Nutty Goodness",
        knownAs: [],
        description: "Raw, unsalted almonds",
        defaultServingWeightGram: 28.0,
        kcalPerServing: 160.0,
        totalFatPerServing: 14.0,
        satFatPerServing: 1.0,
        transFatPerServing: 0.0,
        carbPerServing: 6.0,
        sugarPerServing: 1.0,
        addedSugarPerServing: 0.0,
        proteinPerServing: 6.0,
        lastUpdated: "2024-06-01T17:36:47Z",
        verified: true,
        userId: "550e8400-e29b-41d4-a716-446655440005",
        messageId: 6,
        foodInfoSource: "User",
        adaEmbedding: null,
        UPC: 623456789012,
        defaultServingLiquidMl: null,
        externalId: "almonds001",
        fiberPerServing: 3.5,
        isLiquid: false,
        weightUnknown: false,
        bgeBaseEmbedding: null,
        createdAtDateTime: "2024-06-01T17:36:47Z",
        foodItemCategoryID: "NUTS",
        foodItemCategoryName: "Nuts"
      }
    ]
  },
  {
    id: 6,
    createdAtDateTime: "2024-06-01T17:36:47Z",
    message: "I had Greek Yogurt and Spinach",
    loggedFoodItems: [
      {
        id: 7,
        name: "Greek Yogurt",
        brand: "Yogurt King",
        knownAs: [],
        description: "Plain, non-fat Greek yogurt",
        defaultServingWeightGram: 200.0,
        kcalPerServing: 100.0,
        totalFatPerServing: 0.0,
        satFatPerServing: 0.0,
        transFatPerServing: 0.0,
        carbPerServing: 10.0,
        sugarPerServing: 7.0,
        addedSugarPerServing: 0.0,
        proteinPerServing: 17.0,
        lastUpdated: "2024-06-01T17:36:47Z",
        verified: true,
        userId: "550e8400-e29b-41d4-a716-446655440006",
        messageId: 7,
        foodInfoSource: "User",
        adaEmbedding: null,
        UPC: 723456789012,
        defaultServingLiquidMl: null,
        externalId: "yogurt001",
        fiberPerServing: 0.0,
        isLiquid: false,
        weightUnknown: false,
        bgeBaseEmbedding: null,
        createdAtDateTime: "2024-06-01T17:36:47Z",
        foodItemCategoryID: "DAIRY",
        foodItemCategoryName: "Dairy"
      },
      {
        id: 8,
        name: "Spinach",
        brand: "Veggie Delight",
        knownAs: ["Baby Spinach"],
        description: "Fresh baby spinach leaves",
        defaultServingWeightGram: 30.0,
        kcalPerServing: 7.0,
        totalFatPerServing: 0.1,
        satFatPerServing: 0.0,
        transFatPerServing: 0.0,
        carbPerServing: 1.1,
        sugarPerServing: 0.1,
        addedSugarPerServing: 0.0,
        proteinPerServing: 0.9,
        lastUpdated: "2024-06-01T17:36:47Z",
        verified: true,
        userId: "550e8400-e29b-41d4-a716-446655440007",
        messageId: 8,
        foodInfoSource: "User",
        adaEmbedding: null,
        UPC: 823456789012,
        defaultServingLiquidMl: null,
        externalId: "spinach001",
        fiberPerServing: 0.7,
        isLiquid: false,
        weightUnknown: false,
        bgeBaseEmbedding: null,
        createdAtDateTime: "2024-06-01T17:36:47Z",
        foodItemCategoryID: "VEG",
        foodItemCategoryName: "Vegetable"
      },
      {
        id: 9,
        name: "Whole Wheat Bread",
        brand: "Bakery Fresh",
        knownAs: ["Whole Grain Bread"],
        description: "100% whole wheat bread",
        defaultServingWeightGram: 28.0,
        kcalPerServing: 70.0,
        totalFatPerServing: 1.0,
        satFatPerServing: 0.2,
        transFatPerServing: 0.0,
        carbPerServing: 12.0,
        sugarPerServing: 2.0,
        addedSugarPerServing: 1.0,
        proteinPerServing: 3.0,
        lastUpdated: "2024-06-01T17:36:47Z",
        verified: true,
        userId: "550e8400-e29b-41d4-a716-446655440008",
        messageId: 9,
        foodInfoSource: "User",
        adaEmbedding: null,
        UPC: 923456789012,
        defaultServingLiquidMl: null,
        externalId: "bread001",
        fiberPerServing: 2.0,
        isLiquid: false,
        weightUnknown: false,
        bgeBaseEmbedding: null,
        createdAtDateTime: "2024-06-01T17:36:47Z",
        foodItemCategoryID: "GRAINS",
        foodItemCategoryName: "Grains"
      },
      {
        id: 10,
        name: "Orange",
        brand: "Citrus Grove",
        knownAs: [],
        description: "Fresh orange",
        defaultServingWeightGram: 131.0,
        kcalPerServing: 62.0,
        totalFatPerServing: 0.2,
        satFatPerServing: 0.03,
        transFatPerServing: 0.0,
        carbPerServing: 15.5,
        sugarPerServing: 12.0,
        addedSugarPerServing: 0.0,
        proteinPerServing: 1.2,
        lastUpdated: "2024-06-01T17:36:47Z",
        verified: false,
        userId: "550e8400-e29b-41d4-a716-446655440009",
        messageId: 10,
        foodInfoSource: "User",
        adaEmbedding: null,
        UPC: 1023456789012,
        defaultServingLiquidMl: null,
        externalId: "orange001",
        fiberPerServing: 3.1,
        isLiquid: false,
        weightUnknown: false,
        bgeBaseEmbedding: null,
        createdAtDateTime: "2024-06-01T17:36:47Z",
        foodItemCategoryID: "FRT",
        foodItemCategoryName: "Fruit"
      }
    ]
  }
]

const Header: React.FC = () => {
  return (
    <div className="bg-[#E0E9EC] p-4 rounded-b-xl">
      <div className="flex items-center space-x-4">
        <button className="bg-black text-white w-8 h-8 rounded-full flex items-center justify-center">&lsaquo;</button>
        <div className="flex items-center space-x-2 grow">
          <h1 className="text-2xl font-semibold">Feb</h1>
          <button className="text-gray-600">&#9662;</button>
        </div>
        <button className="bg-gray-200 text-gray-600 text-sm">Today</button>
        <button className="bg-black text-white w-8 h-8 rounded-full flex items-center justify-center">&rsaquo;</button>
      </div>
      <div className="flex items-center justify-between mt-4 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
          <div key={index} className="text-center">
            <div className="text-sm text-gray-500">{day}</div>
            <div
              className={`w-8 h-8 mx-auto ${
                index === 1 ? "bg-black text-white" : "bg-transparent border-2 border-gray-300"
              } rounded-full flex items-center justify-center mt-2`}
            >
              {index + 1}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FooterNav() {
  return (
    <header className="bg-white shadow">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold leading-6 text-gray-900">Nav Bar</h1>
      </div>
    </header>
  )
}
export default function FoodLog() {
  return (
    <div className="h-screen">
      <div className="flex flex-col h-screen">
        <header className="sticky top-0 z-10">
          <Header />
        </header>
        <main className="flex-grow overflow-y-auto p-2 bg-gray-100">
          <FoodLogList />
        </main>
        <footer className="bg-gray-800 text-white p-4 text-center sticky bottom-0 z-10">Footer</footer>
      </div>
    </div>
  )
}
export function FoodLogList() {
  return (
    <div>
      <ul role="list" className="divide-y divide-gray-100">
        {messages.map((message) => (
          <div className="py-4 rounded-lg flex space-x-4 px-2">
            {/* LEFT - DOT WITH TAIL */}
            <div className="rounded-lg flex flex-col justify-between items-center">
              <div className="w-4 h-4 border-2 border-black rounded-full bg-white" />
              <div className="w-px grow bg-gray-400" />
            </div>
            {/* RIGHT - MESSAGE and food items */}
            <div className="flex flex-col rounded-lg space-y-2 grow">
              <h4 className="text-sm">{message.message}</h4>
              <div className="flex flex-row items-center space-x-1">
                <CircleWithLineIcon />
                <p className="text-xs text-gray-500">2 Feb at 12:23pm</p>
              </div>
              <div className="flex flex-row items-center space-x-1">
                <div className="w-2 h-2 border-black rounded-full bg-blue-500" />
                <div className="text-xs pr-2">12 calories</div>
                <div className="w-2 h-2 border-black rounded-full bg-pink-500" />
                <div className="text-xs pr-2">1 protein</div>
                <div className="w-2 h-2 border-black rounded-full bg-orange-500" />
                <div className="text-xs pr-2">5 carb</div>
                <div className="w-2 h-2 border-black rounded-full bg-purple-500" />
                <div className="text-xs pr-2">3 fat</div>
              </div>

              {message.loggedFoodItems.map((foodItem) => (
                <div key={foodItem.id} className="flex flex-col rounded-lg bg-blue-100 p-2 space-y-1">
                  {/* ICON AND FOOD NAME */}
                  <div className="flex flex-row space-x-2">
                    {/* ICON */}
                    <div className="h-9 w-9 bg-white rounded-md"></div>
                    {/* FOOD NAME */}
                    <div>
                      <div className="text-xs text-gray-500">{foodItem.brand}</div>
                      <div className="flex flex row space-x-2 items-center">
                        <div className="text-sm font-semibold leading-6 text-gray-900">{foodItem.name}</div>
                        <div className="text-xs font-thin text-gray-500 border-[1px] border-slate-400 rounded-full px-1">
                          {foodItem.defaultServingWeightGram}g
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* NUTRITION INFO */}
                  <div className="flex flex-row justify-between">
                    <div className="flex flex-col text-center border-[1px] border-r-[0px] border-slate-300 rounded-l-md bg-gray-100 w-full">
                      <div className="text-sm font-semibold text-blue-500">{foodItem.kcalPerServing}</div>
                      <div className="text-xs text-gray-500">calories</div>
                    </div>
                    <div className="flex flex-col text-center border-[1px] border-r-[0px] border-slate-300 bg-gray-100 w-full">
                      <div className="text-sm font-semibold text-pink-500">{foodItem.proteinPerServing}</div>
                      <div className="text-xs text-gray-500">protein</div>
                    </div>
                    <div className="flex flex-col text-center border-[1px] border-r-[0px] border-slate-300 bg-gray-100 w-full">
                      <div className="text-sm font-semibold text-orange-500">{foodItem.carbPerServing}</div>
                      <div className="text-xs text-gray-500">carb</div>
                    </div>
                    <div className="flex flex-col text-center border-[1px] border-slate-300 rounded-r-md bg-gray-100 w-full">
                      <div className="text-sm font-semibold text-purple-500">{foodItem.totalFatPerServing}</div>
                      <div className="text-xs text-gray-500">fat</div>
                    </div>
                  </div>
                  {/* <div className="mt-1 flex items-center gap-x-2 text-xs leading-5 text-gray-500">
                    <p>
                      <a href={`#`} className="hover:underline"></a>
                    </p>
                    <svg viewBox="0 0 2 2" className="h-0.5 w-0.5 fill-current">
                      <circle cx={1} cy={1} r={1} />
                    </svg>
                    <p>
                      <time dateTime={foodItem.createdAtDateTime}>{foodItem.createdAtDateTime}</time>
                    </p>
                  </div> */}
                </div>
              ))}
            </div>
          </div>
        ))}
      </ul>
    </div>
  )
}

const CircleWithLineIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g opacity="0.6" clipPath="url(#clip0)">
      <path
        d="M6 0C4.81331 0 3.65328 0.351894 2.66658 1.01118C1.67989 1.67047 0.910851 2.60754 0.456726 3.7039C0.00259972 4.80026 -0.11622 6.00666 0.115291 7.17054C0.346802 8.33443 0.918247 9.40353 1.75736 10.2426C2.59648 11.0818 3.66558 11.6532 4.82946 11.8847C5.99335 12.1162 7.19975 11.9974 8.2961 11.5433C9.39246 11.0892 10.3295 10.3201 10.9888 9.33342C11.6481 8.34673 12 7.18669 12 6C12 4.4087 11.3679 2.88258 10.2426 1.75736C9.11742 0.632141 7.5913 0 6 0ZM6 11C5.0111 11 4.0444 10.7068 3.22215 10.1573C2.39991 9.60794 1.75904 8.82705 1.38061 7.91342C1.00217 6.99979 0.90315 5.99445 1.09608 5.02455C1.289 4.05464 1.76521 3.16373 2.46447 2.46447C3.16373 1.7652 4.05465 1.289 5.02455 1.09607C5.99446 0.903148 6.99979 1.00216 7.91342 1.3806C8.82705 1.75904 9.60794 2.3999 10.1574 3.22215C10.7068 4.04439 11 5.01109 11 6C11 7.32608 10.4732 8.59785 9.53554 9.53553C8.59785 10.4732 7.32609 11 6 11Z"
        fill="black"
      />
      <path
        d="M8.56501 7.905L6.25001 5.78V3.25C6.25001 3.11739 6.19733 2.99021 6.10356 2.89645C6.0098 2.80268 5.88262 2.75 5.75001 2.75C5.6174 2.75 5.49023 2.80268 5.39646 2.89645C5.30269 2.99021 5.25001 3.11739 5.25001 3.25V6C5.24954 6.0694 5.26353 6.13814 5.29107 6.20184C5.31862 6.26554 5.35912 6.32281 5.41001 6.37L7.91001 8.64C7.95844 8.68496 8.01531 8.71986 8.07732 8.74271C8.13932 8.76555 8.20525 8.77588 8.27127 8.77309C8.33729 8.7703 8.40211 8.75445 8.46197 8.72645C8.52183 8.69846 8.57554 8.65888 8.62001 8.61C8.66269 8.5601 8.69513 8.50228 8.71547 8.43984C8.7358 8.37741 8.74364 8.31157 8.73853 8.24611C8.73342 8.18064 8.71547 8.11682 8.6857 8.0583C8.65593 7.99977 8.61492 7.94768 8.56501 7.905Z"
        fill="black"
      />
    </g>
    <defs>
      <clipPath id="clip0">
        <rect width="12" height="12" fill="white" />
      </clipPath>
    </defs>
  </svg>
)
