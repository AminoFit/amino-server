/** Arithmetic for the meal agent, which should never work numbers out itself: "3/8 * 400", "(2 + 1.5) * 28.35".
 * A small recursive-descent parser over numbers, + - * / and parentheses. No eval, no names, no functions. */
export function calculate(expression: string): number {
  if (expression.length > 200) throw new Error("expression_too_long")
  const tokens = expression.match(/\d+(?:\.\d+)?|\.\d+|[()+\-*/]|\S/g) ?? []
  let position = 0
  const peek = () => tokens[position]
  const take = () => tokens[position++]

  const primary = (): number => {
    const token = take()
    if (token === undefined) throw new Error("incomplete_expression")
    if (token === "(") {
      const value = sum()
      if (take() !== ")") throw new Error("missing_closing_parenthesis")
      return value
    }
    if (token === "-") return -primary()
    if (token === "+") return primary()
    if (/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(token)) return Number(token)
    throw new Error(`unexpected "${token}"`)
  }
  const product = (): number => {
    let value = primary()
    while (peek() === "*" || peek() === "/") {
      const operator = take(), right = primary()
      if (operator === "/" && right === 0) throw new Error("division_by_zero")
      value = operator === "*" ? value * right : value / right
    }
    return value
  }
  const sum = (): number => {
    let value = product()
    while (peek() === "+" || peek() === "-") value = take() === "+" ? value + product() : value - product()
    return value
  }

  const value = sum()
  if (position !== tokens.length) throw new Error(`unexpected "${peek()}"`)
  if (!Number.isFinite(value)) throw new Error("not_a_finite_number")
  return Math.round(value * 10000) / 10000
}
