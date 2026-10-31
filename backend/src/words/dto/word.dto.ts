import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AuxiliaryVerb,
  CefrLevel,
  ConjugationType,
  GrammaticalCase,
  GrammaticalGender,
  NumberType,
  PartOfSpeech,
  ReflexiveType,
  WordReviewStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import type { WordWithDetails } from '../word-detail';

export type Article = 'der' | 'die' | 'das';

const ARTICLE_BY_GENDER: Record<GrammaticalGender, Article> = {
  MASCULINE: 'der',
  FEMININE: 'die',
  NEUTER: 'das',
};

/** Rövid esetnév a megszokott német nyelvtani jelöléssel. */
const CASE_ABBREVIATION: Record<GrammaticalCase, string> = {
  NOMINATIVE: 'Nom.',
  ACCUSATIVE: 'Akk.',
  DATIVE: 'Dat.',
  GENITIVE: 'Gen.',
};

export class NounInfoDto {
  @ApiPropertyOptional({ enum: GrammaticalGender, enumName: 'GrammaticalGender', nullable: true })
  gender!: GrammaticalGender | null;

  @ApiPropertyOptional({ enum: ['der', 'die', 'das'], nullable: true, description: 'A nemből származtatott névelő' })
  article!: Article | null;

  @ApiProperty({ enum: NumberType, enumName: 'NumberType' })
  numberType!: NumberType;

  @ApiPropertyOptional({ nullable: true, example: 'Tische', type: String })
  pluralForm!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Tisches', type: String })
  genitiveSingular!: string | null;

  @ApiProperty()
  isNDeclension!: boolean;
}

export class VerbInfoDto {
  @ApiProperty({ enum: ConjugationType, enumName: 'ConjugationType' })
  conjugationType!: ConjugationType;

  @ApiProperty({ enum: AuxiliaryVerb, enumName: 'AuxiliaryVerb' })
  auxiliary!: AuxiliaryVerb;

  @ApiProperty({ example: 'fährt' })
  present3sg!: string;

  @ApiProperty({ example: 'fuhr' })
  preterite3sg!: string;

  @ApiProperty({ example: 'gefahren' })
  pastParticiple!: string;

  @ApiProperty()
  isSeparable!: boolean;

  @ApiPropertyOptional({ nullable: true, example: 'ab', type: String })
  separablePrefix!: string | null;

  @ApiProperty({ enum: ReflexiveType, enumName: 'ReflexiveType' })
  reflexiveType!: ReflexiveType;
}

export class AdjectiveInfoDto {
  @ApiPropertyOptional({ nullable: true, example: 'besser', type: String })
  comparative!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'am besten', type: String })
  superlative!: string | null;

  @ApiProperty()
  isIrregularComparison!: boolean;

  @ApiProperty()
  isPredicativeOnly!: boolean;
}

export class TranslationDto {
  @ApiProperty({ example: 'asztal' })
  text!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  senseNote!: string | null;

  @ApiProperty()
  isPrimary!: boolean;
}

export class ExampleDto {
  @ApiProperty({ example: 'Ich warte auf den Bus.' })
  sentence!: string;

  @ApiPropertyOptional({ nullable: true, example: 'A buszra várok.', type: String })
  translation!: string | null;
}

export class ValencyDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ nullable: true, example: 'auf', type: String })
  preposition!: string | null;

  @ApiProperty({ enum: GrammaticalCase, enumName: 'GrammaticalCase' })
  governedCase!: GrammaticalCase;

  @ApiProperty({ example: 'Akk.' })
  caseAbbreviation!: string;

  @ApiProperty()
  isReflexive!: boolean;

  @ApiProperty({ example: 'warten auf + Akk.' })
  pattern!: string;

  @ApiPropertyOptional({ nullable: true, example: 'vár valakire/valamire', type: String })
  meaning!: string | null;

  @ApiProperty({ type: [ExampleDto] })
  examples!: ExampleDto[];
}

export class CategoryRefDto {
  @ApiProperty({ example: 'haushalt' })
  slug!: string;

  @ApiProperty({ example: 'Háztartás' })
  nameHu!: string;
}

export class WordDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Tisch' })
  lemma!: string;

  @ApiProperty({ example: 'der Tisch', description: 'Megjelenítési alak (névelővel / „sich”-kel)' })
  display!: string;

  @ApiProperty({ enum: PartOfSpeech, enumName: 'PartOfSpeech' })
  partOfSpeech!: PartOfSpeech;

  @ApiProperty({ example: 1 })
  homographNo!: number;

  @ApiPropertyOptional({ enum: CefrLevel, enumName: 'CefrLevel', nullable: true })
  cefrLevel!: CefrLevel | null;

  @ApiPropertyOptional({ nullable: true, example: 'tɪʃ', type: String })
  ipa!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  audioUrl!: string | null;

  @ApiProperty({ description: 'Saját (felhasználó által felvett) szó-e' })
  isCustom!: boolean;

  @ApiPropertyOptional({
    enum: WordReviewStatus,
    enumName: 'WordReviewStatus',
    nullable: true,
    description: 'Központi szónál az emberi ellenőrzöttség; saját szónál null',
  })
  reviewStatus!: WordReviewStatus | null;

  @ApiPropertyOptional({ type: NounInfoDto, nullable: true })
  noun!: NounInfoDto | null;

  @ApiPropertyOptional({ type: VerbInfoDto, nullable: true })
  verb!: VerbInfoDto | null;

  @ApiPropertyOptional({ type: AdjectiveInfoDto, nullable: true })
  adjective!: AdjectiveInfoDto | null;

  @ApiProperty({ type: [TranslationDto] })
  translations!: TranslationDto[];

  @ApiProperty({ type: [ValencyDto] })
  valencies!: ValencyDto[];

  @ApiProperty({ type: [ExampleDto], description: 'Vonzathoz nem kötött példamondatok' })
  examples!: ExampleDto[];

  @ApiProperty({ type: [CategoryRefDto] })
  categories!: CategoryRefDto[];

  static fromEntity(word: WordWithDetails): WordDto {
    const noun = word.nounAttributes;
    const verb = word.verbAttributes;
    const adjective = word.adjectiveAttributes;
    const article = noun?.gender ? ARTICLE_BY_GENDER[noun.gender] : null;
    const toExample = (e: { sentence: string; translation: string | null }): ExampleDto => ({
      sentence: e.sentence,
      translation: e.translation,
    });

    return {
      id: word.id,
      lemma: word.lemma,
      display: displayForm(word.lemma, article, noun?.numberType ?? null, verb?.reflexiveType ?? null),
      partOfSpeech: word.partOfSpeech,
      homographNo: word.homographNo,
      cefrLevel: word.cefrLevel,
      ipa: word.ipa,
      audioUrl: word.audioUrl,
      isCustom: word.ownerId !== null,
      reviewStatus: word.ownerId === null ? word.reviewStatus : null,
      noun: noun
        ? {
            gender: noun.gender,
            article,
            numberType: noun.numberType,
            pluralForm: noun.pluralForm,
            genitiveSingular: noun.genitiveSingular,
            isNDeclension: noun.isNDeclension,
          }
        : null,
      verb: verb
        ? {
            conjugationType: verb.conjugationType,
            auxiliary: verb.auxiliary,
            present3sg: verb.present3sg,
            preterite3sg: verb.preterite3sg,
            pastParticiple: verb.pastParticiple,
            isSeparable: verb.isSeparable,
            separablePrefix: verb.separablePrefix,
            reflexiveType: verb.reflexiveType,
          }
        : null,
      adjective: adjective
        ? {
            comparative: adjective.comparative,
            superlative: adjective.superlative,
            isIrregularComparison: adjective.isIrregularComparison,
            isPredicativeOnly: adjective.isPredicativeOnly,
          }
        : null,
      translations: word.translations.map((t) => ({ text: t.text, senseNote: t.senseNote, isPrimary: t.isPrimary })),
      valencies: word.valencies.map((v) => ({
        id: v.id,
        preposition: v.preposition,
        governedCase: v.governedCase,
        caseAbbreviation: CASE_ABBREVIATION[v.governedCase],
        isReflexive: v.isReflexive,
        pattern: v.pattern,
        meaning: v.meaning,
        examples: word.examples.filter((e) => e.valencyId === v.id).map(toExample),
      })),
      examples: word.examples.filter((e) => e.valencyId === null).map(toExample),
      categories: word.categories.map((c) => ({ slug: c.category.slug, nameHu: c.category.nameHu })),
    };
  }
}

function displayForm(lemma: string, article: Article | null, numberType: NumberType | null, reflexive: ReflexiveType | null): string {
  if (numberType === 'PLURAL_ONLY') {
    return `die ${lemma}`; // többes szám névelője mindig „die”
  }
  if (article) {
    return `${article} ${lemma}`;
  }
  if (reflexive && reflexive !== 'NONE') {
    return `sich ${lemma}`;
  }
  return lemma;
}

export class WordQueryDto {
  @ApiPropertyOptional({ description: 'Részleges egyezés a német alakra vagy a magyar fordításra', example: 'tisch' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: CefrLevel, enumName: 'CefrLevel' })
  @IsOptional()
  @IsEnum(CefrLevel)
  cefrLevel?: CefrLevel;

  @ApiPropertyOptional({ enum: PartOfSpeech, enumName: 'PartOfSpeech' })
  @IsOptional()
  @IsEnum(PartOfSpeech)
  partOfSpeech?: PartOfSpeech;

  @ApiPropertyOptional({ description: 'Kategória slug', example: 'haushalt' })
  @IsOptional()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  category?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}

export class WordPageDto {
  @ApiProperty({ type: [WordDto] })
  items!: WordDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 0 })
  offset!: number;
}

export class CategoryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'haushalt' })
  slug!: string;

  @ApiProperty({ example: 'Háztartás' })
  nameHu!: string;

  @ApiProperty({ example: 'Haushalt' })
  nameDe!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  parentId!: string | null;
}
