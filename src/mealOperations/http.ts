import { NextResponse } from "next/server"

export function mealOperationError(error:unknown) {
  const code=error&&typeof error==="object"&&"code" in error?String(error.code):""
  const status=code==="23505"||code==="40001"||code==="55000"?409:
    code==="42501"?404:code==="22023"?422:503
  const reason=status===409?"operation_conflict":status===404?"meal_unavailable":
    status===422?"invalid_operation":"operation_unavailable"
  if(status===503) console.error("meal_operation_api_failure",error)
  return NextResponse.json({error:reason},{status})
}
