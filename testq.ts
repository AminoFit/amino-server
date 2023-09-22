const jobs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
for (let job of jobs) {
  const targetUrl = `http://ab5c7598fc4d-259316472161741218.ngrok-free.app/api/test-job`
  console.log("Target URL: ", targetUrl)

  const fetchUrl = `https://api.serverlessq.com?id=ee4149b0-af80-4e6e-b539-6f3ade099e6f&target=${targetUrl}`

  const API_TOKEN = "73e1355f53d24bc0fa1be1f500130ca3cde83001a5e8d62b01ba13fcec488045"
  const result = fetch(fetchUrl, {
    headers: {
      Accept: "application/json",
      "x-api-key": API_TOKEN
    }
  })

  // console.log(`Added to queue with code ${result.status} ${result.statusText}`)
}

console.log("Done")