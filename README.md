This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Env Files
Reach out to Chris or Seb to get a copy of the local `.env.local` stuff that you need.

## Amino Phone Numbers
- Production: `+1 844 495 1001`
- Coudron: `+1 855 650 0610`
- Grubb: `+1 567 292 1010`

## Amino Tunnels
- Coudron `ngrok http --domain=ab5c7598fc4d-259316472161741218.ngrok-free.app 3000`


## Setup postgres locally
### Install Postgres and Run via Docker
`brew install --cask docker`
`docker pull postgres`
`docker run -p 5432:5432 --name amino-postgres -e POSTGRES_PASSWORD=mysecretpassword -d postgres`

Url to import into [TablePlus](https://tableplus.com/). This should be in your .env.local file"
`DATABASE_URL=postgresql://postgres:mysecretpassword@127.0.0.1/postgres?statusColor=005392&env=development&name=Amino%20Localhost&tLSMode=1&usePrivateKey=false&safeModeLevel=0&advancedSafeModeLevel=0&driverVersion=0`

###
After running docker postgres, 
`npm run migrate:dev`




###
Instructions to install pgvector on a local docker image of postgres

Access your docker image (assuming it is called amino-postgres)
`docker exec -it amino-postgres bash`

install git
`apt-get install -y git`

install pgvector
```cd /tmp
git clone --branch v0.4.4 https://github.com/pgvector/pgvector.git
cd pgvector```

make and install
```
apt install postgresql-server-dev-15
export PG_CONFIG=/usr/lib/postgresql/15/bin/pg_config
make
make install
```

exit the docker bash
`exit`

enter postgres
`docker exec -it amino-postgres psql -U postgres -d postgres`

install vector
`CREATE EXTENSION vector;`