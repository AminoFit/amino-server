export function vectorFromSql(value: any) {
  return value
    .substring(1, value.length - 1)
    .split(",")
    .map((v: any) => parseFloat(v))
}

export function vectorToSql(value: any) {
  return JSON.stringify(value)
}
