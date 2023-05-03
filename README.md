# Create T3 App

This is a [T3 Stack](https://create.t3.gg/) project bootstrapped with `create-t3-app`.

# Create SST

This app is created with [SST](https://sst.dev/) using the [create-sst](https://docs.sst.dev/packages/create-sst) package

# Creation Process

```bash
# Create T3 App
npx create-t3-app my-app
cd my-app
# Create SST App
npx create-sst
```

This will create a new next app in the `my-app` directory. and add the following files:

```
  sst.config.ts
  sst-env.d.ts
```

These can be update to add more resources to the app. In this example the app is deployed with an RDS instance to allow for a database connection using [prisma](https://www.youtube.com/watch?v=3tl9XCiQErA&ab_channel=SST).

Once the app is created you can run the following commands to deploy the app locally for testing:

```bash
  # Start the app locally
  npx sst dev
  # Deploy the app
  npm run dev
```

Once you are ready to deploy the app to AWS you can run the following commands:

```bash
  # Deploy the app
  npx sst deploy
  # Destroy the app
  npx sst destroy
```

## Available Scripts

- `build`: Build the app for production
- `dev`: Start the app locally
- `postinstall`: run prisma generate
- `lint`: run eslint
- `start`: Start app from

## SST Commands

[Full Documentation](https://docs.sst.dev/packages/sst)

- `npx sst run dev`: start dev environment
- `npx sst deploy --stage prod`: deploy to prod stage
- `npx sst remove --stage prod`: remove prod stage
