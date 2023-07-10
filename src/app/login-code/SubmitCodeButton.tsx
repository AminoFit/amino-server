// "use client";

// export function SubmitCodeButton({ csrfToken }: { csrfToken?: string }) {
  
  
//   const onSubmit = () => {
//     console.log("csrf", csrfToken);

//     const details = {
//       csrfToken: csrfToken || "",
//       email: "cc",
//       password: "cc",
//     };

//     const body = `csrfToken=${details.csrfToken}&user=${encodeURIComponent(
//       details.user
//     )}&password=${encodeURIComponent(details.password)}`;

//     // var formBody: string[] = [];
//     // for (var property in details) {
//     //   var encodedKey = encodeURIComponent(property);
//     //   var encodedValue = encodeURIComponent(details[property] as string);
//     //   formBody.push(encodedKey + "=" + encodedValue);
//     // }
//     // const body = formBody.join("&");

//     fetch("/api/auth/callback/credentials", {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
//       },
//       body,
//     }).then((res) => {
//       console.log("res", res);
//       // res.json().then((json) => {
//       //   console.log("Result", json)
//       // })
//       res.text().then((text) => {
//         console.log("Text Result", text);
//       });
//     });
//   };



//   return (
//     // <form method="post" action="/api/auth/callback/credentials">
//     //   <input name="csrfToken" type="hidden" defaultValue={csrf} />
//     //   <label>
//     //     Username
//     //     <input name="username" type="text" />
//     //   </label>
//     //   <label>
//     //     Password
//     //     <input name="password" type="password" />
//     //   </label>
//     //   <button type="submit">Sign in</button>
//     // </form>
//     <button onClick={onSubmit}>Sign in</button>
//   );
// }
