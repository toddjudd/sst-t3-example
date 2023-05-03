import { RDSInstance } from "./RDSInstance";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { IpAddresses, SecurityGroup, Vpc } from "aws-cdk-lib/aws-ec2";
import { type SSTConfig } from "sst";
import { Config, NextjsSite } from "sst/constructs";

export default {
  config(_input) {
    return {
      name: "sst-t3-example",
      region: "us-east-1",
    };
  },
  stacks(app) {
    app.stack(function Site({ stack }) {
      // Crate VPC with 3 subnets
      const vpc = new Vpc(stack, app.logicalPrefixedName("net"), {
        natGateways: 1,
        ipAddresses: IpAddresses.cidr("172.32.0.0/16"),
        subnetConfiguration: [
          {
            cidrMask: 24,
            name: "public",
            subnetType: ec2.SubnetType.PUBLIC,
          },
          // Private subnet with internet access, will host Lambda functions
          {
            cidrMask: 24,
            name: "private",
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          },
          // Private subnet without internet access, will host databases
          {
            cidrMask: 24,
            name: "database",
            subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          },
        ],
        // extra vpc configuration can be done here
      });

      // Create a security group for the Lambda functions
      const lambdaSecurityGroup = new SecurityGroup(
        stack,
        app.logicalPrefixedName("lambda-sg"),
        {
          vpc,
          description: "Allow lambda functions to access the database",
        }
      );
      // configure lambdas to use security group
      app.setDefaultFunctionProps({
        vpc,
        securityGroups: [lambdaSecurityGroup],
      });

      // Create RDS Database
      // This will create an RDS instance in the database subnet
      // This utilizes the custom  RDSInstance construct from ./RDSInstance.ts
      const databaseName = app.logicalPrefixedName("db");
      const rds = new RDSInstance(stack, "db", {
        vpc,
        engine: "mysql5.7",
        databaseName,
      });

      // Alternatively, you can use the following to create an Arura Serverless v2 cluster
      // My understanding is the price for this is much larger than an instance
      // However it's a built in sst construct and handles migrations
      // const rds = new RDS(stack, "Cluster", {
      //   cdk: {
      //     cluster: {
      //       vpc,
      //     },
      //   },
      //   engine: "postgresql10.14",
      //   defaultDatabaseName: "tttrdstest",
      //   migrations: "migrations",
      // });

      // Allow Lambda functions to access the database
      // without this the lambda functions won't be able to reach the database!
      const { instance } = rds.cdk;
      instance.connections.allowFrom(
        lambdaSecurityGroup,
        ec2.Port.tcp(3306),
        "Allow access from lambda to Aurora DB"
      );

      // generate a database url and store it in a parameter
      const user = instance.secret?.secretValueFromJson("username");
      const pass = instance.secret?.secretValueFromJson("password");
      // this url is based on the mysql usage in the rds construct
      // there may be a better way to do this.
      const url = `mysql://${user}:${pass}@${instance?.instanceEndpoint.hostname}/${databaseName}?connection_limit=5`;

      // add the database url to the default function env
      app.addDefaultFunctionEnv({ ["DATABASE_URL"]: url });
      // add the database url to the stack parameters.. This should probably be done by secret manager instead
      new Config.Parameter(stack, "DATABASE_URL", {
        value: url,
      });

      // Create Next.js site
      const site = new NextjsSite(stack, "site", {
        environment: {
          ...process.env,
          // pass the database url to the site
          DATABASE_URL: url,
        },
        cdk: {
          server: {
            // use the private subnet for the lambda functions
            vpc,
            allowAllOutbound: true,
            // use the lambda security group to ensure db access
            securityGroups: [lambdaSecurityGroup],
          },
        },
      });

      stack.addOutputs({
        SiteUrl: site.url,
      });
    });
  },
} satisfies SSTConfig;
