import { Duration, Stack } from 'aws-cdk-lib';
import { Certificate, type ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import {
    AllowedMethods,
    CachePolicy,
    Distribution,
    OriginProtocolPolicy,
    OriginRequestPolicy,
    ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { SecurityGroup, SubnetType, type Vpc } from 'aws-cdk-lib/aws-ec2';
import { type IRepository, Repository } from 'aws-cdk-lib/aws-ecr';
import {
    type Cluster,
    ContainerImage,
    Secret as EcsSecret,
    LogDrivers,
    PropagatedTagSource,
} from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { ApplicationProtocol, SslPolicy } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { PolicyDocument, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import {
    Credentials,
    DatabaseCluster,
} from 'aws-cdk-lib/aws-rds';
import { ARecord, type IHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { type ISecret, Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { pascalCase, pascalCaseTransformMerge } from 'change-case';
import { Construct } from 'constructs';

export interface ApiServiceProps {
    instanceName: string;
    vpc: Vpc;
    cluster: Cluster;
    hostedZone: IHostedZone;
    certificateArn: string;
    datadogApiKeySecretArn: string;
    ecs: {
        containerPort: number;
        containerName: string;
        desiredCount?: number;
        dockerRepository: string;
    };
    cloudfront: {
        certificateArn: string;
        wafArn: string;
    };
    releaseTag: string;
    environment: string;
}

export class A2aUiService extends Construct {
    public readonly certificate: ICertificate;
    public readonly serviceSecret: ISecret;
    public readonly datadogApiSecret: ISecret;
    public readonly ecrRegistry: IRepository;
    public readonly ecsFargateService: ApplicationLoadBalancedFargateService;
    public readonly ecsRole: Role;
    public readonly auroraCluster: DatabaseCluster;
    public readonly auroraSG: SecurityGroup;
    public readonly auroraAccessSG: SecurityGroup;
    public readonly auroraCredentials: Credentials;

    public constructor(scope: Construct, id: string, props: ApiServiceProps) {
        const resourceId = pascalCase(`${id}`, {
            transform: pascalCaseTransformMerge,
        });
        super(scope, 'A2AUI');

        const region = Stack.of(scope).region;

        // Cert for ALB HTTPS
        this.certificate = Certificate.fromCertificateArn(
            this,
            'Certificate',
            props.certificateArn,
        );

        // ECR repo for Docker image
        this.ecrRegistry = Repository.fromRepositoryArn(
            this,
            'Registry',
            props.ecs.dockerRepository,
        );

        // Datadog API key secret
        this.datadogApiSecret = Secret.fromSecretCompleteArn(
            this,
            'DatadogApiSecret',
            props.datadogApiKeySecretArn,
        );

        // ECS Task Role with minimum permissions for ECR & Logs
        this.ecsRole = new Role(this, 'Role', {
            assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
            inlinePolicies: {
                deployment: new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            actions: [
                                'ecr:GetAuthorizationToken',
                                'ecr:BatchCheckLayerAvailability',
                                'ecr:GetDownloadUrlForLayer',
                                'ecr:BatchGetImage',
                                'logs:CreateLogGroup',
                                'logs:CreateLogStream',
                                'logs:PutLogEvents',
                                'logs:DescribeLogStreams',
                            ],
                            resources: ['*'],
                        }),
                    ],
                }),
            },
        });

        // Security group for A2A UI service
        const a2aUiSecurityGroup = new SecurityGroup(this, `${resourceId}SG`, {
            vpc: props.vpc,
            allowAllOutbound: true,
            securityGroupName: `${props.instanceName}-a2a-ui-sg`,
        });

        // ECS Fargate service with ALB
        this.ecsFargateService = new ApplicationLoadBalancedFargateService(this, 'FargateService', {
            cluster: props.cluster,
            cpu: 512,
            memoryLimitMiB: 1024,
            desiredCount: props.ecs.desiredCount ?? 1,
            taskImageOptions: {
                image: ContainerImage.fromEcrRepository(
                    this.ecrRegistry,
                    props.releaseTag ?? 'latest',
                ),
                containerPort: props.ecs.containerPort ?? 3000,
                executionRole: this.ecsRole,
                taskRole: this.ecsRole,
                enableLogging: true,
                containerName: 'a2a',
                family: 'a2a-ui',
                logDriver: LogDrivers.firelens({
                    options: {
                        Name: 'datadog',
                        Host: 'http-intake.logs.datadoghq.eu',
                        TLS: 'on',
                        dd_service: 'a2a-ui',
                        dd_source: 'ecs',
                        dd_tags: `env:${props.environment},region:${region},component:a2a-ui`,
                        provider: 'ecs',
                        retry_limit: '2',
                    },
                    secretOptions: {
                        apikey: EcsSecret.fromSecretsManager(this.datadogApiSecret),
                    },
                }),
                environment: {
                    ENV: props.environment,
                    LISTEN_PORT: props.ecs.containerPort.toString(),
                },
            },
            assignPublicIp: false,
            certificate: this.certificate,
            enableECSManagedTags: true,
            enableExecuteCommand: true,
            healthCheckGracePeriod: Duration.minutes(2),
            maxHealthyPercent: 200,
            minHealthyPercent: 50,
            propagateTags: PropagatedTagSource.SERVICE,
            protocol: ApplicationProtocol.HTTPS,
            publicLoadBalancer: true,
            redirectHTTP: true,
            securityGroups: [a2aUiSecurityGroup],
            serviceName: 'api',
            sslPolicy: SslPolicy.RECOMMENDED_TLS,
            targetProtocol: ApplicationProtocol.HTTP,
            taskSubnets: props.vpc.selectSubnets({
                subnetType: SubnetType.PRIVATE_WITH_EGRESS,
            }),
        });

        this.ecsFargateService.targetGroup.configureHealthCheck({
            path: '/api/health',
            healthyHttpCodes: '200-399',
            interval: Duration.seconds(10),
            timeout: Duration.seconds(5),
            healthyThresholdCount: 2,
            unhealthyThresholdCount: 3,
        });

        const distribution = new Distribution(this, `${resourceId}Distribution`, {
            defaultBehavior: {
                origin: new HttpOrigin(this.ecsFargateService.loadBalancer.loadBalancerDnsName, {
                    protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
                }),
                allowedMethods: AllowedMethods.ALLOW_ALL,
                viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                originRequestPolicy: OriginRequestPolicy.ALL_VIEWER,
                cachePolicy: CachePolicy.CACHING_DISABLED, // Use optimized caching if serving static content
            },
            domainNames: [`a2a-ui.${props.hostedZone.zoneName}`],
            // MUST BE IN US-EAST-1 AWS_REGION!
            certificate: Certificate.fromCertificateArn(
                this,
                `${resourceId}CloudfrontCertificate`,
                props.cloudfront.certificateArn,
            ),
            webAclId: props.cloudfront.wafArn,
        });

        new ARecord(this, `${resourceId}DNS`, {
            zone: props.hostedZone,
            recordName: 'a2a-ui',
            target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
        });
    }
}
