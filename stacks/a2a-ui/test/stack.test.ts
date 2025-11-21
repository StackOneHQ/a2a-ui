import { App } from 'aws-cdk-lib';
/* eslint-disable prettier/prettier */
import { Template } from 'aws-cdk-lib/assertions';
import { beforeEach, describe, expect, test } from 'vitest';

import { A2AStack } from '../src/stack';

describe('api', () => {
    let stack: A2AStack;

    beforeEach(async () => {
        process.env.CDK_DEFAULT_REGION = 'region';
        process.env.CDK_DEFAULT_ACCOUNT = '000000000000';
    });

    test('should return a correct cloudformation snapshot', () => {
        process.env.CDK_CONTEXT_JSON = JSON.stringify({
            environment: 'staging',
            environments: {
                staging: {
                    region: {
                        vpcId: 'vpc-123',
                        hostedZone: 'stackone-exp.com',
                        vpnSecurityGroup: 'sg-11111111111111111',
                        datadogApiKeySecretArn:
                            'arn:aws:secretsmanager:eu-west-2:553332017094:secret:DdApiKeySecret-FDLILY',
                        certificateArn:
                            'arn:aws:acm:eu-west-2:553332017094:certificate/4d66a426-7102-4852-91fb-1ba8274f50c2',
                        ecs: {
                            'a2a-ui': {
                                dockerRepository:
                                    'arn:aws:ecr:eu-west-2:553332017094:repository/a2a/a2a-ui',
                                containerPort: 3000,
                                containerName: 'a2a',
                                desiredCount: 1,
                            },
                        },
                        cloudfront: {
                            certificateArn:
                                'arn:aws:acm:us-east-1:553332017094:certificate/4e1499e8-01b2-4486-a316-743d6e80b03d',
                            wafArn: 'arn:aws:wafv2:us-east-1:553332017094:global/webacl/CloudFrontWebAcl/3f536158-73ee-4825-91aa-71122ffac2d1',
                        },
                    },
                },
            },
            releaseTag: 'latest',
        });

        stack = new A2AStack(new App());

        expect(Template.fromStack(stack).toJSON()).toMatchSnapshot();
    });
});
