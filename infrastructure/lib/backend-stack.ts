import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

interface BackendStackProps extends cdk.StackProps {
  stage: string;
  ingredientsTable: dynamodb.Table;
  recipesTable: dynamodb.Table;
  domainName?: string;
}

export class BackendStack extends cdk.Stack {
  readonly instance: ec2.Instance;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "BackendVPC", {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        { subnetType: ec2.SubnetType.PUBLIC, name: "Public", cidrMask: 24 },
      ],
    });

    const sg = new ec2.SecurityGroup(this, "BackendSG", {
      vpc,
      allowAllOutbound: true,
      description: "La Table d'Amélie backend",
    });
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), "SSH");
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "HTTP");
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS");
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3001), "NestJS API");

    const role = new iam.Role(this, "BackendRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
      ],
    });

    props.ingredientsTable.grantReadWriteData(role);
    props.recipesTable.grantReadWriteData(role);

    role.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      resources: ["*"],
    }));

    const keyPairName = process.env.EC2_KEY_PAIR || `ta-${props.stage}`;

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "yum update -y",
      "curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -",
      "yum install -y nodejs git",
      "npm install -g pnpm@10",
      "mkdir -p /opt/la-table-amelie",
      `cat > /opt/la-table-amelie/.env << 'ENVEOF'`,
      `PORT=3001`,
      `AWS_REGION=${this.region}`,
      `INGREDIENTS_TABLE=${props.ingredientsTable.tableName}`,
      `RECIPES_TABLE=${props.recipesTable.tableName}`,
      `ENVEOF`,
    );

    this.instance = new ec2.Instance(this, "BackendInstance", {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: sg,
      role,
      userData,
      keyPair: ec2.KeyPair.fromKeyPairName(this, "KeyPair", keyPairName),
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      associatePublicIpAddress: true,
    });

    new cdk.CfnOutput(this, "InstancePublicIp", {
      value: this.instance.instancePublicIp,
      description: "Backend EC2 public IP",
    });

    new cdk.CfnOutput(this, "InstanceId", {
      value: this.instance.instanceId,
      description: "Backend EC2 instance ID (for SSM)",
    });

    new cdk.CfnOutput(this, "SSHCommand", {
      value: `ssh -i ${keyPairName}.pem ec2-user@\${${this.instance.instancePublicIp}}`,
      description: "SSH into the instance",
    });
  }
}
