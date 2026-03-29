import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

interface DataStackProps extends cdk.StackProps {
  stage: string;
}

export class DataStack extends cdk.Stack {
  readonly ingredientsTable: dynamodb.Table;
  readonly recipesTable: dynamodb.Table;
  readonly settingsTable: dynamodb.Table;
  readonly eventsTable: dynamodb.Table;
  readonly groceryListsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const retention = props.stage === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    this.ingredientsTable = new dynamodb.Table(this, "IngredientsTable", {
      tableName: `ta-ingredients-${props.stage}`,
      partitionKey: { name: "ingredientId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: retention,
    });

    this.recipesTable = new dynamodb.Table(this, "RecipesTable", {
      tableName: `ta-recipes-${props.stage}`,
      partitionKey: { name: "recipeId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: retention,
    });

    this.settingsTable = new dynamodb.Table(this, "SettingsTable", {
      tableName: `ta-settings-${props.stage}`,
      partitionKey: { name: "settingsId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: retention,
    });

    this.eventsTable = new dynamodb.Table(this, "EventsTable", {
      tableName: `ta-events-${props.stage}`,
      partitionKey: { name: "eventId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: retention,
    });

    this.groceryListsTable = new dynamodb.Table(this, "GroceryListsTable", {
      tableName: `ta-grocery-lists-${props.stage}`,
      partitionKey: { name: "listId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: retention,
    });
  }
}
