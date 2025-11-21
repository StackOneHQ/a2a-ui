import type { App } from 'aws-cdk-lib';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { Cluster, ContainerInsights } from 'aws-cdk-lib/aws-ecs';
import { PublicHostedZone } from 'aws-cdk-lib/aws-route53';
import { A2aUiService, type ApiServiceProps } from './a2a-ui';
import { Stack, type StackArguments } from './cdk-stack';

const ROLE = 'a2a-ui';

export class A2AStack extends Stack {
    public constructor(app: App) {
        super(app, {
            role: ROLE,
            description: 'Defines the components for the a2a service',
        } as StackArguments);

        // params
        const _context = this.node.tryGetContext('environments')[this.env][this.region];
        const releaseTag = this.node.tryGetContext('releaseTag');

        // set termination protection for the stack
        this.terminationProtection = _context.terminationProtection ?? true;

        const vpc = Vpc.fromLookup(this, 'Vpc', {
            vpcId: _context.vpcId,
        }) as Vpc;

        const cluster = new Cluster(this, 'Cluster', {
            vpc,
            clusterName: 'a2a',
            containerInsightsV2: ContainerInsights.ENABLED,
        });

        const hostedZone = PublicHostedZone.fromLookup(this, 'HostedZone', {
            domainName: _context.hostedZone,
        });

        // This service provides the API for the A2A service
        const apiServiceProps: ApiServiceProps = {
            instanceName: 'a2a-ui',
            vpc,
            cluster,
            hostedZone,
            certificateArn: _context.certificateArn,
            datadogApiKeySecretArn: _context.datadogApiKeySecretArn,
            ecs: _context.ecs['a2a-ui'],
            cloudfront: _context.cloudfront,
            environment: this.env,
            releaseTag: releaseTag ?? 'latest',
        };

        new A2aUiService(this, 'Api', apiServiceProps);
    }
}
