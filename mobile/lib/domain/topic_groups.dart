/// Témakör-csoportok: a szókincs ~30 finom kategóriája helyett néhány nagyobb,
/// áttekinthető témakör. A csoportosítás a kliensen történik (a szerver
/// kategóriái változatlanok), így a meglévő helyi adatbázison is azonnal működik.
///
/// A [TopicGroup.slugs] a szerver kategóriáinak slugjai. Egy szó több csoportba
/// is tartozhat, ha több kategóriája van.
class TopicGroup {
  const TopicGroup({required this.id, required this.nameHu, required this.slugs});

  final String id;
  final String nameHu;
  final List<String> slugs;
}

const topicGroups = <TopicGroup>[
  TopicGroup(
    id: 'mindennapok',
    nameHu: 'Mindennapok és otthon',
    slugs: ['alltag', 'haushalt', 'wohnen', 'lebensmittel', 'kleidung', 'zeit', 'stadt'],
  ),
  TopicGroup(id: 'emberek', nameHu: 'Ember, család, egészség', slugs: ['menschen', 'familie', 'gefuehle', 'koerper', 'gesundheit']),
  TopicGroup(id: 'munka', nameHu: 'Munka, gazdaság, oktatás', slugs: ['arbeit', 'wirtschaft', 'bildung']),
  TopicGroup(id: 'tarsadalom', nameHu: 'Társadalom, politika, jog', slugs: ['gesellschaft', 'politik', 'recht']),
  TopicGroup(id: 'termeszet', nameHu: 'Természet és környezet', slugs: ['natur', 'wetter', 'tiere', 'umwelt']),
  TopicGroup(id: 'szabadido', nameHu: 'Szabadidő, kultúra, utazás', slugs: ['freizeit', 'kultur', 'reisen', 'verkehr']),
  TopicGroup(id: 'kommunikacio', nameHu: 'Kommunikáció, média, tudomány', slugs: ['kommunikation', 'medien', 'wissenschaft']),
  TopicGroup(id: 'alap', nameHu: 'Alapszókincs és elvont fogalmak', slugs: ['grundwortschatz', 'abstrakt']),
];

TopicGroup? topicGroupById(String id) {
  for (final g in topicGroups) {
    if (g.id == id) return g;
  }
  return null;
}
