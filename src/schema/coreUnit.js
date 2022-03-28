import { gql } from 'apollo-server-core';

export const typeDefs = gql`

    type CoreUnit {
        "id is autogenerated in the database"
        id: ID!
        code: String
        name: String
        cuMip: [CuMip]
        budgetStatements: [BudgetStatement]
        socialMediaChannels: [SocialMediaChannels]
        contributorCommitment: [ContributorCommitment]
        cuGithubContribution: [CuGithubContribution]
        roadMap: [Roadmap]
    }

    type CoreUnitPayload {
        errorrs: [Error!]!
        coreUnit: CoreUnit
    }

    extend type Query {
        coreUnits: [CoreUnit],
        coreUnit(code: String): [CoreUnit],
    }

    # Using form <model>Action e.g. coreUnitAdd for better grouping in the API browser
    type Mutation {
        coreUnitAdd(input: CoreUnitInput!): CoreUnitPayload!
        coreUnitDelete: ID!
    }

    input CoreUnitInput {
        code: String!
        name: String!
    }

`;

export const resolvers = {
    Query: {
        // coreUnits: (parent, args, context, info) => {}
        coreUnits: async (_, __, { dataSources }) => {
            // console.log(await dataSources.db.getBudgetStatements())
            return await dataSources.db.getCoreUnits();
        },
        coreUnit: async (_, { code }, { dataSources }) => {
            return await dataSources.db.getCoreUnitByCode(code)
        }
    },
    CoreUnit: {
        budgetStatements: async (parent, __, { dataSources }) => {
            const { id } = parent;
            const result = await dataSources.db.getBudgetStatements();
            const budgetStatements = result.filter(statement => {
                return statement.cuId === id;
            })
            return budgetStatements;
        },
        cuMip: async (parent, __, { dataSources }) => {
            const { id } = parent;
            const result = await dataSources.db.getMips();
            const cuMips = result.filter(cuMip => {
                return cuMip.cuId === id;
            })
            return cuMips;
        },
        socialMediaChannels: async (parent, __, {dataSources}) => {
            const {id} = parent;
            const result = await dataSources.db.getSocialMediaChannels();
            const socialMediaChannels = result.filter(coreUnit => {
                return coreUnit.cuId === id;
            })
            return socialMediaChannels;
        },
        contributorCommitment: async (parent, __, {dataSources}) => {
            const {id} = parent;
            const result = await dataSources.db.getContributorCommitments();
            const contributorCommitments = result.filter(commitment => {
                return commitment.cuId === id;
            })
            return contributorCommitments;
        }
    },
    Mutation: {
        coreUnitAdd: async (_, { input }, { dataSources }) => {
            let errors;
            let coreUnit;
            try {
                await dataSources.db.addCoreUnit(input.code, input.name)
                coreUnit = await dataSources.db.getCoreUnitById(input.code);
                return { errors, coreUnit: coreUnit[0] }
            } catch (error) {
                errors = error
                return { errors, coreUnit: '' }
            }
        },

        coreUnitDelete: async (_, __, { }) => {
            return null;
        }

    }
};