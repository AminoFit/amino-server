import { Merge } from "type-fest"
import { Database as DatabaseGenerated } from "./supabase-generated.types"
// export type Database = MergeDeep<
//   DatabaseGenerated,
//   {
//     public: {
//       Views: {
//         movies_view: {
//           Row: {
//             // id is a primary key in public.movies, so it must be `not null`
//             id: number
//           }
//         }
//       }
//     }
//   }
// >
export type Tables<T extends keyof DatabaseGenerated["public"]["Tables"]> = DatabaseGenerated["public"]["Tables"][T]["Row"]
export type Enums<T extends keyof DatabaseGenerated["public"]["Enums"]> = DatabaseGenerated["public"]["Enums"][T]