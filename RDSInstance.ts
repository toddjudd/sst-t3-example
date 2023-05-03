import { isCDKConstruct } from "sst/constructs/Construct.js";
import { Construct } from "constructs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import type * as cdk from "aws-cdk-lib";
import type { App } from "sst/constructs";
import type * as secretsManager from "aws-cdk-lib/aws-secretsmanager";

import type { FunctionBindingProps } from "sst/constructs/util/functionBinding";

export interface RDSCdkDatabaseInstanceProps
  extends Omit<rds.DatabaseInstanceProps, "vpc" | "databaseName" | "scaling"> {
  vpc?: ec2.IVpc;
}

interface RDSInstanceProps {
  vpc?: ec2.IVpc;
  databaseName: string;
  engine: "mysql5.7" | "postgresql11.13";
  // migrations?: string;
  cdk?: {
    /**
     * Allows you to override default id for this construct.
     */
    id?: string;
    /**
     * Configure the internallly created RDS instance.
     *
     * @example
     * ```js
     * new RDS(stack, "Database", {
     *   cdk: {
     *     instance: {
     *       instanceIdentifier: "my-instance",
     *     }
     *   },
     * });
     * ```
     *
     * Alternatively, you can import an existing RDS Serverless v1 Instance in your AWS account.
     *
     * @example
     * ```js
     * new RDS(stack, "Database", {
     *   cdk: {
     *     instance: rds.ServerlessInstance.fromServerlessInstanceAttributes(stack, "IInstance", {
     *       instanceIdentifier: "my-instance",
     *     }),
     *     secret: secretsManager.Secret.fromSecretAttributes(stack, "ISecret", {
     *       secretPartialArn: "arn:aws:secretsmanager:us-east-1:123456789012:secret:my-secret",
     *     }),
     *   },
     * });
     * ```
     */
    instance?: rds.IDatabaseInstance | RDSCdkDatabaseInstanceProps;
    /**
     * Required when importing existing RDS Serverless v1 Instance.
     */
    secret?: secretsManager.ISecret;
  };
}

export type RDSEngineType = RDSInstanceProps["engine"];

export class RDSInstance extends Construct {
  public readonly id: string;
  public readonly cdk: {
    /**
     * The ARN of the internally created CDK ServerlessInstance instance.
     */
    instance: rds.DatabaseInstance;
  };
  /**
   * The ARN of the internally created CDK ServerlessInstance instance.
   */
  // public migratorFunction?: Fn;
  private props: RDSInstanceProps;
  private secret: cdk.aws_secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: RDSInstanceProps) {
    super(scope, props.cdk?.id || id);

    this.id = id;
    this.cdk = {} as any;
    this.props = props || {};

    const { cdk } = props;

    if (cdk && isCDKConstruct(cdk.instance)) {
      this.validateCDKPropWhenIsConstruct();
      this.cdk.instance = this.importInstance();
      this.secret = cdk.secret!;
    } else {
      this.validateCDKPropWhenIsInstanceProps();
      this.cdk.instance = this.createInstance();
      this.secret = this.cdk.instance.secret!;
    }
  }

  public get secretArn(): string {
    return this.secret.secretArn;
  }

  public get instanceArn(): string {
    return this.cdk.instance.instanceArn;
  }

  public get instanceIdentifier(): string {
    return this.cdk.instance.instanceIdentifier;
  }

  public get instanceEndpoint(): string {
    return this.cdk.instance.instanceEndpoint.hostname;
  }

  public get databaseName(): string {
    return this.props.databaseName;
  }

  public getConstructMetadata() {
    const { engine, databaseName } = this.props;
    return {
      type: "RDSInstance" as const,
      data: {
        engine,
        secretArn: this.secretArn,
        instanceArn: this.instanceArn,
        instanceIdentifier: this.instanceIdentifier,
        databaseName,
      },
    };
  }

  /** @internal */
  public getFunctionBinding(): FunctionBindingProps {
    return {
      clientPackage: "rds",
      variables: {
        instanceArn: {
          type: "plain",
          value: this.instanceArn,
        },
        secretArn: {
          type: "plain",
          value: this.secretArn,
        },
        databaseName: {
          type: "plain",
          value: this.databaseName,
        },
      },
      permissions: {
        "rds-data:*": [this.instanceArn],
        "secretsmanager:GetSecretValue": [
          this.secret.secretFullArn || `${this.secret.secretArn}*`,
        ],
        "secretsmanager:DescribeSecret": [
          this.secret.secretFullArn || `${this.secret.secretArn}*`,
        ],
      },
    };
  }

  private validateCDKPropWhenIsConstruct() {
    const { cdk } = this.props;
    if (!cdk?.secret) {
      throw new Error(
        `Missing "cdk.secret" in the "${this.node.id}" RDS. You must provide a secret to import an existing RDS Serverless Instance.`
      );
    }
  }

  private validateCDKPropWhenIsInstanceProps() {
    const { cdk } = this.props;
    const props = (cdk?.instance || {}) as RDSCdkDatabaseInstanceProps;

    // Validate "engine" is passed in from the top level
    if ((props as any).engine) {
      throw new Error(
        `Use "engine" instead of "cdk.instance.engine" to configure the RDS database engine.`
      );
    }

    // Validate "vpc" is passed in from the top level
    if ((props as any).vpc) {
      throw new Error(
        `Use "vpc" instead of "cdk.instance.vpc" to configure the RDS database vpc.`
      );
    }

    // Validate "databaseName" is passed in from the top level
    if ((props as any).databaseName) {
      throw new Error(
        `Use "databaseName" instead of "cdk.instance.databaseName" to configure the RDS database engine.`
      );
    }

    // Validate Secrets Manager is used for "credentials"
    if (props.credentials && !props.credentials.secret) {
      throw new Error(
        `Only credentials managed by SecretManager are supported for the "cdk.instance.credentials".`
      );
    }

    return props;
  }

  private importInstance() {
    const { cdk } = this.props;
    return cdk!.instance as rds.DatabaseInstance;
  }

  private getEngine(engine: RDSEngineType): rds.IInstanceEngine {
    if (engine === "mysql5.7") {
      return rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_5_7,
      });
    } else if (engine === "postgresql11.13") {
      return rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_11_13,
      });
    }

    throw new Error(
      `The specified "engine" is not supported for sst.RDS. Only mysql5.6, mysql5.7, postgresql10.14, and postgresql11.13 engines are currently supported.`
    );
  }

  private getVpc(vpc?: ec2.IVpc): ec2.IVpc {
    if (vpc) {
      return vpc;
    }

    return new ec2.Vpc(this, "vpc", {
      natGateways: 0,
    });
  }

  private getVpcSubnets(
    props: RDSCdkDatabaseInstanceProps
  ): ec2.SubnetSelection | undefined {
    if (props.vpc) {
      return props.vpcSubnets;
    }

    return {
      subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
    };
  }

  private getInstanceType(
    props: RDSCdkDatabaseInstanceProps
  ): ec2.InstanceType | undefined {
    if (props.instanceType) {
      return props.instanceType;
    }

    return ec2.InstanceType.of(
      ec2.InstanceClass.BURSTABLE3,
      ec2.InstanceSize.SMALL
    );
  }

  private createInstance() {
    const { cdk, databaseName, engine, vpc } = this.props;
    const app = this.node.root as App;
    const instanceProps = (cdk?.instance || {}) as RDSCdkDatabaseInstanceProps;

    return new rds.DatabaseInstance(this, "DB", {
      instanceIdentifier: app.logicalPrefixedName(this.node.id),
      ...instanceProps,
      engine: this.getEngine(engine || "mysql5.7"),
      vpc: this.getVpc(vpc),
      vpcSubnets: this.getVpcSubnets(instanceProps),
      instanceType: this.getInstanceType(instanceProps),
      databaseName: databaseName,
    });
  }
}
