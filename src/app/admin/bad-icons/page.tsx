"use client"

import { createClient } from "@/utils/supabase/client"
import { CopyButton } from "./CopyButton"
import { NextRequest } from "next/server"
import { useEffect, useState } from "react"
import { ArrowLongLeftIcon, ArrowLongRightIcon } from "@heroicons/react/24/outline"

const RESULTS_PER_PAGE = 40

export default function BadIconsPage() {
  const [foodItemCount, setFoodItemCount] = useState<number>(0)
  const [currentPage, setPage] = useState<number>(1)
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      const { error, count } = await supabase.from("FoodItemImages").select("*", { count: "exact", head: true })

      if (error) {
        console.error(error)
        return
      }
      if (!count) {
        console.error("No Count")
        return
      }
      setFoodItemCount(count)
    }
    fetchData()
  }, [])

  return (
    <div className="mx-auto my-16 max-w-7xl px-4 sm:px-6 lg:px-8">
      {/* We've used 3xl here, but feel free to try other max-widths based on your needs */}
      <div className="mx-auto max-w-3xl">
        <BadIconTable currentPage={currentPage} />
        <PageNav currentPage={currentPage} pageCount={Math.ceil(foodItemCount / RESULTS_PER_PAGE)} setPage={setPage} />
      </div>
    </div>
  )
}

function BadIconTable({ currentPage }: { currentPage: number }) {
  const [foods, setFoods] = useState<any>([])
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      const { data: FoodItemImages, error } = await supabase
        .from("FoodItemImages")
        .select("*, FoodItem(name), FoodImage(pathToImage)")
        .order("similarity", { ascending: true })
        .range((currentPage - 1) * RESULTS_PER_PAGE, (currentPage - 1) * RESULTS_PER_PAGE + RESULTS_PER_PAGE)
      if (error) {
        console.error(error)
        return
      }
      setFoods(FoodItemImages)
    }
    fetchData()
  }, [currentPage])
  
  return (
    <div className="">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-base font-semibold leading-6 text-gray-900">Bad Icons</h1>
          <p className="mt-2 text-sm text-gray-700">A list the icons with the lowest similarity to the food item.</p>
        </div>
      </div>
      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            <table className="min-w-full divide-y divide-gray-300">
              <thead>
                <tr>
                  <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">
                    Current Icon
                  </th>
                  <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">
                    Name
                  </th>
                  <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                    Similarity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {foods.map((item: any) => (
                  <tr key={item.id}>
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-0">
                      <img src={item.FoodImage?.pathToImage} alt={item.name} width={60} height={60} />
                    </td>
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-0">
                      {item.FoodItem?.name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 text-right">{item.similarity}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      <CopyButton name={item.FoodItem?.name || ""} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function PageNav({
  currentPage,
  pageCount,
  setPage
}: {
  currentPage: number
  pageCount: number
  setPage: (page: number) => void
}) {
  // Calculate the range of pages to display
  const startPage = Math.max(1, currentPage - 5)
  const endPage = Math.min(pageCount, currentPage + 5)
  const pages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i)

  return (
    <nav className="flex items-center justify-between border-t border-gray-200 px-4 sm:px-0">
      <div className="-mt-px flex w-0 flex-1">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault()
            if (currentPage > 1) setPage(currentPage - 1)
          }}
          className="inline-flex items-center border-t-2 border-transparent pr-1 pt-4 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
        >
          <ArrowLongLeftIcon className="mr-3 h-5 w-5 text-gray-400" aria-hidden="true" />
          Previous
        </a>
      </div>
      <div className="hidden md:-mt-px md:flex">
        {/* Conditionally render the first page and ellipsis if the startPage is greater than 1 */}
        {startPage > 1 && (
          <>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                setPage(1)
              }}
              className="inline-flex items-center border-t-2 border-transparent px-4 pt-4 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
            >
              1
            </a>
            {startPage > 2 && (
              <span className="inline-flex items-center border-t-2 border-transparent px-4 pt-4 text-sm font-medium text-gray-500">
                ...
              </span>
            )}
          </>
        )}

        {pages.map((page) => (
          <a
            key={page}
            href="#"
            onClick={(e) => {
              e.preventDefault()
              setPage(page)
            }}
            className={`inline-flex items-center border-t-2 px-4 pt-4 text-sm font-medium ${
              currentPage === page
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
            aria-current={currentPage === page ? "page" : undefined}
          >
            {page}
          </a>
        ))}

        {/* Conditionally render the last page and ellipsis if the endPage is less than pageCount */}
        {endPage < pageCount && (
          <>
            {endPage < pageCount - 1 && (
              <span className="inline-flex items-center border-t-2 border-transparent px-4 pt-4 text-sm font-medium text-gray-500">
                ...
              </span>
            )}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                setPage(pageCount)
              }}
              className="inline-flex items-center border-t-2 border-transparent px-4 pt-4 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
            >
              {pageCount}
            </a>
          </>
        )}
      </div>
      <div className="-mt-px flex w-0 flex-1 justify-end">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault()
            if (currentPage < pageCount) setPage(currentPage + 1)
          }}
          className="inline-flex items-center border-t-2 border-transparent pl-1 pt-4 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
        >
          Next
          <ArrowLongRightIcon className="ml-3 h-5 w-5 text-gray-400" aria-hidden="true" />
        </a>
      </div>
    </nav>
  )
}
