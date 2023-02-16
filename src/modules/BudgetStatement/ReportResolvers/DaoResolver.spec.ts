import initKnex from "../../../initKnex.js";
import { Knex } from "knex";
import { BudgetReportPeriod } from "../BudgetReportPeriod.js";
import { BudgetReportPath } from "../BudgetReportPath.js";
import { DaoResolver } from "./DaoResolver.js";
import { BudgetReportGranularity } from "../BudgetReportQuery.js";

let knex:Knex;

beforeAll(async () => {
    knex = initKnex()
});

afterAll(async () => {
    knex.destroy();
});

it ('works', async () => {

    const resolver = new DaoResolver();
    const period = ['2021/10', '2021/11', '2021/12'];
    const query = {
        start: period[0],
        end: period[2],
        period: '2021/Q4',
        budgetPath: BudgetReportPath.fromString('makerdao/core-units'),
        categoryPath: BudgetReportPath.fromString('*'),
        granularity: BudgetReportGranularity.Monthly,
        groupPath: ['makerdao', 'core-units']
    };

    const result = await resolver.execute(query);
    expect(Object.keys(result.nextResolversData)).toEqual(['CoreUnitsResolver']);
});
