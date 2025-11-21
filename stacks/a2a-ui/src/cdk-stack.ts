import { type App, Stack as CDKStack } from 'aws-cdk-lib';

export interface StackArguments {
    role: string;
    description: string;
    region?: string;
}

/**
 * Stack CDK Construct
 * This construct extend the AWS CDK Stack constructs.
 * It adds a role variable, description and env.
 * It also declare a S3 bucket (from the cdk bootstrap) used to receive stack templates.
 */
export class Stack extends CDKStack {
    public role: string;
    public description: string;
    public env: string;

    public constructor(scope: App, args: StackArguments) {
        // Validates that default variables are set (usually defaulted to AWS_* variables).
        if (!(process.env.CDK_DEFAULT_REGION && process.env.CDK_DEFAULT_ACCOUNT)) {
            throw new Error('CDK_DEFAULT_REGION and CDK_DEFAULT_ACCOUNT must be assigned.');
        }

        // STACK
        super(scope, args.role, {
            stackName: args.role,
            description: args.description,
            env: {
                account: process.env.CDK_DEFAULT_ACCOUNT,
                region: args.region || process.env.CDK_DEFAULT_REGION,
            },
        });

        this.role = args.role;
        this.description = args.description;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        this.env = this.node.tryGetContext('environment');
    }
}
