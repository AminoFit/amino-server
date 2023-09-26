from FlagEmbedding import FlagModel
sentences_1 = ['Skim milk']
sentences_2 = ["Milk",
               "Milk, 2% milkfat",
               "Milk, 2%",
               "Full fat milk",
               "Nonfat milk",
               "3.25% milk",
               ]
model = FlagModel('BAAI/bge-base-en-v1.5', 
                  query_instruction_for_retrieval="",
                  use_fp16=False) # Setting use_fp16 to True speeds up computation with a slight performance degradation
embeddings_1 = model.encode(sentences_1)
embeddings_2 = model.encode(sentences_2)
print(embeddings_1.shape)
similarity = embeddings_1 @ embeddings_2.T
print(similarity)

