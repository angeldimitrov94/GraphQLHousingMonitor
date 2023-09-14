//defines types for G5 Marketing Cloud GraphQL queries

type G5GraphQLQuery = {
    operationName: String,
    [key: string]: any,
    query: String
}

type Price = {
    formattedPrice: string;
}

type Unit = {
    id: number;
    externalId: string;
    name: string;
    availabilityDate: string;
    prices: Price[];
}

type Floorplan = {
    id: number;
};

type ApartmentComplexData = {
    apartmentComplex: {
        floorplans: Floorplan[];
    };
};

type FloorplanIdsResponse = {
    data: ApartmentComplexData;
};

export { G5GraphQLQuery as G5MarketingGraphQLQuery, Unit, FloorplanIdsResponse, Price, Floorplan, ApartmentComplexData };